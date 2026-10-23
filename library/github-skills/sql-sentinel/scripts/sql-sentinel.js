'use strict';

// ============================================================================
// sql-sentinel.js — Static SQL cost & performance audit engine.
// Zero dependencies. Parses SQL into statements, runs a rule suite over each,
// scores warehouse health 0-100, and returns a prioritized cost-reduction plan.
//
// Designed for BigQuery / Snowflake / Redshift / Postgres / Spark SQL.
// The rules are warehouse-agnostic cost & performance anti-patterns that hold
// across analytical SQL engines.
//
// Usage (Node):
//   const { auditSql } = require('./sql-sentinel');
//   const report = auditSql(sqlString);
//
// CLI:
//   node sql-sentinel.js path/to/query.sql        # pretty report
//   node sql-sentinel.js path/to/query.sql --json # machine-readable
//   cat query.sql | node sql-sentinel.js -        # read from stdin
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Tokenizer + statement splitter
// ----------------------------------------------------------------------------

/**
 * Split a SQL script into individual statements, honoring single-quoted,
 * double-quoted, backtick, dollar-quote ($$...$$), and -- / /* line comments.
 * Returns an array of { sql, startLine }.
 */
function splitStatements(sql) {
  const statements = [];
  let buf = '';
  let i = 0;
  let startLine = 1;
  let line = 1;

  const isQuote = (c) => c === "'" || c === '"' || c === '`';

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    // Line comment --
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') { buf += sql[i]; i++; }
      continue;
    }
    // Block comment / * ... * / (also BigQuery inline # comment handled below)
    if (c === '/' && next === '*') {
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        if (sql[i] === '\n') line++;
        buf += sql[i]; i++;
      }
      if (i < sql.length) { buf += sql[i]; buf += sql[i + 1]; i += 2; }
      continue;
    }
    // Hash comment (BigQuery / Redshift / MySQL)
    if (c === '#') {
      while (i < sql.length && sql[i] !== '\n') { buf += sql[i]; i++; }
      continue;
    }
    // Quoted string — copy verbatim until matching close quote (handles '' escapes)
    if (isQuote(c)) {
      const q = c;
      buf += c; i++;
      while (i < sql.length) {
        if (sql[i] === '\n') line++;
        buf += sql[i];
        if (sql[i] === q) {
          // doubled quote = escaped, keep going
          if (sql[i + 1] === q) { buf += sql[i + 1]; i += 2; continue; }
          i++; break;
        }
        i++;
      }
      continue;
    }
    // Dollar quote $$ ... $$ (Postgres)
    if (c === '$' && sql.slice(i, i + 2) === '$$') {
      buf += '$$'; i += 2;
      while (i < sql.length && sql.slice(i, i + 2) !== '$$') {
        if (sql[i] === '\n') line++;
        buf += sql[i]; i++;
      }
      if (i < sql.length) { buf += '$$'; i += 2; }
      continue;
    }

    if (c === '\n') line++;

    // Statement terminator: semicolon not inside quote/comment
    if (c === ';') {
      const trimmed = buf.trim();
      if (trimmed.length) statements.push({ sql: trimmed, startLine });
      buf = '';
      startLine = line;
      i++;
      continue;
    }

    buf += c; i++;
  }
  const tail = buf.trim();
  if (tail.length) statements.push({ sql: tail, startLine });
  return statements;
}

// ----------------------------------------------------------------------------
// 2. SQL helpers (case-insensitive, comment-free analysis)
// ----------------------------------------------------------------------------

function stripCommentsAndStrings(s) {
  return s
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/#[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/`(?:[^`])`/g, '``');
}

function upper(s) { return s.toUpperCase(); }

/** Count keyword occurrences of a word boundary match (case-insensitive). */
function countWord(sql, word) {
  const re = new RegExp(`\\b${word}\\b`, 'gi');
  const m = sql.match(re);
  return m ? m.length : 0;
}

function hasWord(sql, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(sql);
}

/** Extract SELECT-list text (between SELECT ... and the next FROM/INTO). */
function selectList(sql) {
  const m = sql.match(/SELECT\s+(.*?)\s+FROM/is);
  return m ? m[1] : '';
}

/** Extract FROM/JOIN table references (rough — table aliases & subqueries filtered later). */
function fromTables(sql) {
  const tables = [];
  const re = /(?:FROM|JOIN)\s+([A-Za-z_][\w.]*(?:\s*\.\s*[A-Za-z_*][\w*]*)?)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    let t = m[1].replace(/\s+/g, '');
    if (t) tables.push(t);
  }
  return tables;
}

/** Extract WHERE predicate text (between WHERE and GROUP/ORDER/LIMIT/UNION/;) */
function whereClause(sql) {
  const m = sql.match(/\bWHERE\b\s+(.*?)(?=\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|\bHAVING\b|\bUNION\b|\bWINDOW\b|\bQUALIFY\b|$)/is);
  return m ? m[1] : '';
}

// ----------------------------------------------------------------------------
// 3. Rule suite — each rule is (stmt, ctx) => Finding | null
//    Severity: critical | high | medium | low
//    Finding: { id, title, severity, line, snippet, why, fix, estSavings }
// ----------------------------------------------------------------------------

const RULES = [];

function rule(id, title, severity, run) {
  RULES.push({ id, title, severity, run });
}

// R1 — SELECT *
rule('SQL001', 'SELECT * forces full column scan', 'high', (stmt, ctx) => {
  const s = stmt.clean;
  // SELECT * (not SELECT col.*) — find SELECT immediately followed by *
  // Note: no \b after * (it's a non-word char); use lookahead for whitespace/FROM instead.
  if (/\bSELECT\s+(?:DISTINCT\s+)?\*\s/i.test(s + ' ') && !/\bSELECT\s+(?:DISTINCT\s+)?[\w.]+\.\s*\*\s/i.test(s + ' ')) {
    return {
      id: 'SQL001', title: 'SELECT * forces full column scan',
      severity: 'high', line: stmt.startLine,
      snippet: (s.match(/SELECT\s+[*]/i) || [''])[0],
      why: 'SELECT * reads every column from every scanned table, blowing up bytes billed on BigQuery/Snowflake and preventing column-pruning. On a 200-column fact table this can cost 50-200x more than naming the 5 columns you need.',
      fix: 'List only the columns you actually use. Even `t.id, t.created_at, t.amount` cuts bytes processed dramatically.',
      estSavings: '30-90% bytes scanned on wide tables',
    };
  }
  return null;
});

// R2 — No WHERE clause on a SELECT (potential full scan)
rule('SQL002', 'Query has no WHERE clause (full table scan)', 'critical', (stmt, ctx) => {
  const s = stmt.clean;
  if (!/\bSELECT\b/i.test(s)) return null;
  if (hasWord(s, 'INTO')) return null; // SELECT INTO / INSERT
  if (!/\bFROM\b/i.test(s)) return null;
  if (hasWord(s, 'WHERE')) return null;
  if (hasWord(s, 'JOIN') && hasWord(s, 'ON')) return null; // joins may filter via ON
  // small tables / metadata are fine, but flag the risk
  return {
    id: 'SQL002', title: 'Query has no WHERE clause (full table scan)',
    severity: 'critical', line: stmt.startLine,
    snippet: s.slice(0, 80),
    why: 'A SELECT ... FROM without a WHERE reads every row. On a billion-row fact table this is the #1 cause of runaway warehouse bills and slow dashboards. Even an indexed PK filter bounds the scan.',
    fix: 'Add a WHERE predicate on a partition/filter column (e.g. date, tenant_id). If you genuinely need all rows, partition the table and filter by partition.',
    estSavings: 'often 90%+ of bytes/cost',
  };
});

// R3 — Non-sargable predicate: leading wildcard LIKE '%term'
rule('SQL003', 'Leading-wildcard LIKE ("%term") defeats indexes', 'high', (stmt, ctx) => {
  // Inspect RAW sql — clean strips string contents which LIKE patterns need.
  const s = stmt.sql;
  const re = /LIKE\s+'%[^']*'/gi;
  const m = s.match(re);
  if (m) {
    return {
      id: 'SQL003', title: 'Leading-wildcard LIKE ("%term") is non-sargable',
      severity: 'high', line: stmt.startLine,
      snippet: m[0],
      why: 'LIKE \'%term\' cannot use a B-tree/zone-map index because it must inspect every value. LIKE \'term%\' (suffix wildcard) IS indexable. This is a classic full-scan trigger on large text columns.',
      fix: "If you only need suffix matches, use LIKE 'term%'. For substring search at scale, use a dedicated FULLTEXT/SOLUTIONS index or a tokenized column.",
      estSavings: 'index lookup vs full scan — 10-1000x',
    };
  }
  return null;
});

// R4 — Function wrapped around column in WHERE (kills index usage)
rule('SQL004', 'Function on indexed column kills index usage', 'high', (stmt, ctx) => {
  const s = stmt.clean;
  const where = whereClause(s);
  if (!where) return null;
  // WHERE LOWER(col) = ... , WHERE DATE(col) = ... , WHERE col::text = ...
  // LOWER(col), LOWER(t.col), DATE(col), SUBSTR(col,..) etc. — match function(col) or function(alias.col)
  const re = /\b(LOWER|UPPER|DATE|TRUNC|SUBSTR|SUBSTRING|LEFT|RIGHT|CAST|CONVERT|FLOOR|CEIL|EXTRACT|YEAR|MONTH|DAY|TO_CHAR|TO_DATE|UNIX_SECONDS|TIMESTAMP_TRUNC|DATETIME_TRUNC)\s*\(\s*([A-Za-z_][\w]*\.)*[A-Za-z_][\w]*\s*[,)]/i;
  const m = where.match(re);
  if (m) {
    return {
      id: 'SQL004', title: 'Function wrapping a column defeats indexes/zone maps',
      severity: 'high', line: stmt.startLine,
      snippet: m[0],
      why: 'Wrapping a column in a function (LOWER(col), DATE(col), SUBSTR(col,...)) makes the predicate non-sargable: the engine cannot use the column\'s index or clustering, so it scans the whole column.',
      fix: 'Rewrite as a range on the raw column: instead of WHERE DATE(ts) = \'2026-01-01\' use WHERE ts >= \'2026-01-01\' AND ts < \'2026-01-02\'.',
      estSavings: 'index seek vs full scan',
    };
  }
  return null;
});

// R5 — Cartesian / CROSS JOIN
rule('SQL005', 'CROSS JOIN produces a Cartesian product', 'critical', (stmt, ctx) => {
  const s = stmt.clean;
  const isCross = /\bCROSS\s+JOIN\b/i.test(s);
  // comma join: FROM a, b  (a comma-separated list of tables in the FROM clause)
  let isComma = false;
  let snippet = 'CROSS JOIN';
  const fromMatch = s.match(/FROM\s+(.*?)(?=\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|\bUNION\b|\bWINDOW\b|\bQUALIFY\b|\bHAVING\b|$)/is);
  if (fromMatch) {
    const fromClause = fromMatch[1];
    // count top-level commas (naive — but sufficient for static heuristics)
    const commaCount = (fromClause.match(/,/g) || []).length;
    if (commaCount > 0) {
      isComma = true;
      snippet = 'FROM ... , ... (comma join)';
    }
  }
  if (!isCross && !isComma) return null;
  return {
    id: 'SQL005', title: 'CROSS JOIN / comma-join produces a Cartesian product',
    severity: 'critical', line: stmt.startLine,
    snippet: snippet,
    why: 'A CROSS JOIN multiplies every row of one table by every row of the other. Two 1M-row tables → 1 trillion rows. This is the single fastest way to OOM a warehouse or run up a 5-figure BigQuery bill on one query.',
    fix: 'Replace with an INNER/LEFT JOIN ON an explicit key. If you genuinely need a cross product, add a LIMIT and a WHERE on both sides first.',
    estSavings: 'can turn a $0.02 query into a $200 query',
  };
});

// R6 — SELECT DISTINCT (sort/hash cost)
rule('SQL006', 'SELECT DISTINCT forces a full dedup sort/hash', 'medium', (stmt, ctx) => {
  const s = stmt.clean;
  if (!/\bSELECT\s+DISTINCT\b/i.test(s)) return null;
  return {
    id: 'SQL006', title: 'SELECT DISTINCT forces an expensive dedup',
    severity: 'medium', line: stmt.startLine,
    snippet: 'SELECT DISTINCT',
    why: 'DISTINCT requires the engine to hash/sort the entire result set to deduplicate it. On wide or high-cardinality result sets this spills to disk and multiplies memory + time.',
    fix: 'Prefer GROUP BY the columns you actually need, or add earlier filtering to reduce the set BEFORE deduping. If dedup is on a key, use ROW_NUMBER() OVER (...) and filter rn=1 to dedup early.',
    estSavings: 'memory spill avoidance',
  };
});

// R7 — ORDER BY without LIMIT
rule('SQL007', 'ORDER BY without LIMIT forces full result sort', 'medium', (stmt, ctx) => {
  const s = stmt.clean;
  if (!/\bORDER\s+BY\b/i.test(s)) return null;
  if (/\bLIMIT\b/i.test(s)) return null;
  return {
    id: 'SQL007', title: 'ORDER BY without LIMIT sorts the full result set',
    severity: 'medium', line: stmt.startLine,
    snippet: 'ORDER BY ... (no LIMIT)',
    why: 'Sorting requires materializing and sorting the entire result. Without a LIMIT the engine cannot short-circuit; it must sort every row. This is a top cause of dashboard timeouts.',
    fix: 'Add a LIMIT (even a large one) so the engine can use top-N sort. For "most recent N", pair ORDER BY with LIMIT and a partition filter.',
    estSavings: 'top-N sort vs full sort',
  };
});

// R8 — NOT IN with a subquery (NULL trap + often materialized)
rule('SQL008', 'NOT IN (subquery) — NULL trap and anti-join hazard', 'high', (stmt, ctx) => {
  const s = stmt.clean;
  const re = /NOT\s+IN\s*\(\s*SELECT\b/i;
  if (!re.test(s)) return null;
  return {
    id: 'SQL008', title: 'NOT IN (SELECT ...) — NULL semantics hazard',
    severity: 'high', line: stmt.startLine,
    snippet: 'NOT IN (SELECT ...)',
    why: 'NOT IN against a subquery returns NO rows if the subquery produces any NULL. It also often materializes the subquery and scans it per-row. This is a correctness bug AND a performance bug.',
    fix: 'Use NOT EXISTS (correlated subquery) or a LEFT JOIN ... WHERE right.id IS NULL pattern. Both are NULL-safe and typically faster.',
    estSavings: 'correctness + often 10x+ faster',
  };
});

// R9 — Implicit type cast in join/where (prevents index + may broadcast)
rule('SQL009', 'Implicit cast in JOIN/WHERE comparison', 'medium', (stmt, ctx) => {
  const s = stmt.clean;
  // col = '123' where col is numeric, or col = 123 where col is text — heuristic: string literal compared without quotes to a likely-numeric, or vice versa
  const joinMatch = s.match(/ON\s+\w[\w.]*\s*=\s*['"][^'"]*['"]/i) || s.match(/=\s*['"][0-9]+['"]/);
  if (!joinMatch) return null;
  return {
    id: 'SQL009', title: 'Likely implicit type cast in comparison',
    severity: 'medium', line: stmt.startLine,
    snippet: joinMatch[0],
    why: 'Comparing a numeric column to a string literal (or vice versa) forces an implicit CAST on every row, which disables index/zone-map usage and may trigger a broadcast on join keys of mismatched type.',
    fix: 'Match types explicitly: WHERE user_id = 123 (numeric) not WHERE user_id = \'123\'. On joins ensure both key columns are the same type.',
    estSavings: 'index usability',
  };
});

// R10 — OR in WHERE that could be IN / UNION (often prevents index merge)
rule('SQL010', 'OR in WHERE can prevent index merge', 'low', (stmt, ctx) => {
  const s = stmt.clean;
  const where = whereClause(s);
  if (!where) return null;
  const orCount = (where.match(/\bOR\b/gi) || []).length;
  if (orCount < 2) return null;
  // same-column OR a=1 OR a=2 OR a=3 → should be IN
  const inPattern = /\b(\w+)\s*=\s*\?/i;
  return {
    id: 'SQL010', title: `${orCount} ORs in WHERE — consider IN or UNION ALL`,
    severity: 'low', line: stmt.startLine,
    snippet: `... OR ... (${orCount} OR clauses)`,
    why: 'Multiple OR predicates on different columns often prevent the optimizer from using more than one index (no index merge) and can force full scans. Repeated same-column ORs (a=1 OR a=2) should be IN.',
    fix: 'Convert same-column ORs to IN (...). For multi-column ORs, consider UNION ALL of single-predicate queries (each can use its own index).',
    estSavings: 'index merge enablement',
  };
});

// R11 — COUNT(DISTINCT ...) on large data (HyperLogLog alternative)
rule('SQL011', 'COUNT(DISTINCT) on potentially large column', 'medium', (stmt, ctx) => {
  const s = stmt.clean;
  if (!/COUNT\s*\(\s*DISTINCT\b/i.test(s)) return null;
  return {
    id: 'SQL011', title: 'COUNT(DISTINCT ...) is memory-heavy at scale',
    severity: 'medium', line: stmt.startLine,
    snippet: 'COUNT(DISTINCT ...)',
    why: 'Exact COUNT(DISTINCT) builds a hash set of every distinct value in memory. On high-cardinality columns (user ids, urls) over billions of rows this spills and dominates query cost.',
    fix: 'For approximate counts use APPROX_COUNT_DISTINCT (BigQuery/SQL Server), HLL (Snowflake/Postgres), or APPROX_COUNT_DISTINCT (Spark). ~1-2% error, fraction of the memory.',
    estSavings: 'memory + often 10-50x faster',
  };
});

// R12 — LIMIT without ORDER BY (non-deterministic)
rule('SQL012', 'LIMIT without ORDER BY returns arbitrary rows', 'low', (stmt, ctx) => {
  const s = stmt.clean;
  if (!/\bLIMIT\b/i.test(s)) return null;
  if (/\bORDER\s+BY\b/i.test(s)) return null;
  return {
    id: 'SQL012', title: 'LIMIT without ORDER BY is non-deterministic',
    severity: 'low', line: stmt.startLine,
    snippet: 'LIMIT ... (no ORDER BY)',
    why: 'Without ORDER BY, the engine returns an arbitrary subset of rows — different on each run, and different across warehouses. This causes flaky dashboards and "why did my number change?" incidents.',
    fix: 'Add an ORDER BY (even on a tie-breaker like id) before LIMIT for reproducible results.',
    estSavings: 'correctness/debugging time',
  };
});

// R13 — Subquery in SELECT list (N+1 / per-row execution risk)
rule('SQL013', 'Scalar subquery in SELECT list (per-row execution)', 'medium', (stmt, ctx) => {
  const s = stmt.clean;
  const list = selectList(s);
  if (!list) return null;
  // a (SELECT ...) inside the select list
  if (/\(\s*SELECT\b/i.test(list)) {
    return {
      id: 'SQL013', title: 'Scalar subquery in SELECT list',
      severity: 'medium', line: stmt.startLine,
      snippet: '(SELECT ...) in SELECT list',
      why: 'A correlated scalar subquery in the SELECT list can execute once per output row. On large outer result sets this is an O(N) hidden cost. Some optimizers decorrelate it; many do not.',
      fix: 'Rewrite as a JOIN or LEFT JOIN to a pre-aggregated CTE so the inner query runs once.',
      estSavings: 'N executions → 1',
    };
  }
  return null;
});

// R14 — Many JOINs (5+) — CTE materialization / broadcast storms
rule('SQL014', '5+ JOINs — wide join graph, broadcast/spill risk', 'medium', (stmt, ctx) => {
  const s = stmt.clean;
  const joinCount = (s.match(/\bJOIN\b/gi) || []).length;
  if (joinCount < 5) return null;
  return {
    id: 'SQL014', title: `${joinCount} JOINs in one query`,
    severity: 'medium', line: stmt.startLine,
    snippet: `${joinCount} × JOIN`,
    why: 'Queries with 5+ joins produce a large join graph where the optimizer is more likely to pick a bad join order, broadcast a large table, or spill. This is the profile of "the query that was fast in dev and times out in prod."',
    fix: 'Split into staged CTEs, materialize intermediate aggregates, and ensure every join key is the same type and ideally the clustering/distribution key.',
    estSavings: 'join-order stability',
  };
});

// R15 — No partition/cluster filter hint detected on a likely-fact table
// (heuristic: SELECT on a table named like *_events / *_fact / *_log with no date filter)
rule('SQL015', 'Likely fact table scanned without a date/partition filter', 'high', (stmt, ctx) => {
  const s = stmt.clean;
  if (hasWord(s, 'WHERE')) return null;
  const tables = fromTables(s);
  const factish = tables.find(t => /(events?|facts?|logs?|history|stream|raw)$/i.test(t));
  if (!factish) return null;
  return {
    id: 'SQL015', title: `Fact table "${factish}" scanned without a partition filter`,
    severity: 'high', line: stmt.startLine,
    snippet: `FROM ${factish} (no date WHERE)`,
    why: `Tables named like "${factish}" are almost always time-partitioned append-only fact tables. Querying them without a date/partition predicate scans the entire history — the dominant cause of warehouse cost overruns.`,
    fix: 'Add a WHERE on the partition column (e.g. event_time, ds, created_at) to bound the scan to a partition window.',
    estSavings: 'full history → one partition (often 99%+ bytes)',
  };
});

// R16 — SELECT over a CTE referenced once (inline; usually fine but note)
rule('SQL016', 'CTE defined but referenced once (could inline)', 'low', (stmt, ctx) => {
  const s = stmt.clean;
  const ctes = s.match(/\bWITH\s+\w+\s+AS\b/gi);
  if (!ctes || ctes.length === 0) return null;
  return null; // deep reference-count check omitted to stay zero-dep & fast; placeholder for Pro
});

// R17 — String concatenation in SELECT (silent perf + correctness)
rule('SQL017', 'String concatenation (|| or CONCAT) in SELECT list', 'low', (stmt, ctx) => {
  const s = stmt.clean;
  const list = selectList(s);
  if (!list) return null;
  if (/\|\|/.test(list) || /CONCAT\s*\(/i.test(list)) {
    return {
      id: 'SQL017', title: 'String concatenation in SELECT list',
      severity: 'low', line: stmt.startLine,
      snippet: '... || ... or CONCAT(...)',
      why: 'Per-row string concatenation is CPU-bound and can NULL-out the whole row if any input is NULL (with ||). At scale it shows up as query CPU time and silent NULL propagation.',
      fix: 'Use CONCAT() with explicit COALESCE for NULL safety, or compute the concatenated column at load/materialization time.',
      estSavings: 'CPU time + correctness',
    };
  }
  return null;
});

// R18 — Unbounded window function (OVER () with no partition)
rule('SQL018', 'Window function over () with no PARTITION (full sort)', 'medium', (stmt, ctx) => {
  const s = stmt.clean;
  const re = /\b(SUM|COUNT|AVG|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|NTILE)\s*\([^)]*\)\s*OVER\s*\(\s*\)/i;
  if (!re.test(s)) return null;
  return {
    id: 'SQL018', title: 'Window function OVER () with no PARTITION',
    severity: 'medium', line: stmt.startLine,
    snippet: '... OVER ()',
    why: 'OVER () computes the window over the ENTIRE result set — a single global sort/hash. On large inputs this is the most expensive window shape. Almost always you want PARTITION BY some key.',
    fix: 'Add a PARTITION BY clause (e.g. PARTITION BY user_id, tenant_id) to shard the window computation.',
    estSavings: 'global sort → partitioned sort',
  };
});

// R19 — correlated EXISTS subquery without index hint context (note)
// (kept lightweight; flagged only as informational in low severity)

// R20 — DELETE/UPDATE without WHERE (catastrophic)
rule('SQL020', 'DELETE/UPDATE without WHERE — affects every row', 'critical', (stmt, ctx) => {
  const s = stmt.clean;
  if (!/^\s*(DELETE|UPDATE)\b/i.test(s)) return null;
  if (hasWord(s, 'WHERE')) return null;
  return {
    id: 'SQL020', title: 'DELETE/UPDATE without WHERE — mass data change',
    severity: 'critical', line: stmt.startLine,
    snippet: s.slice(0, 60),
    why: 'A DELETE or UPDATE with no WHERE modifies or removes EVERY row in the table. This is the classic "I dropped the production users table" footgun. Even on a replica it can lock the table for hours.',
    fix: 'Always include a WHERE. Run SELECT with the same predicate first to confirm the affected row count. Wrap in a transaction.',
    estSavings: 'avoids data loss / table lock',
  };
});

// R21 — SELECT * inside an EXISTS / IN subquery (style, low)
rule('SQL021', 'SELECT * inside subquery (use SELECT 1 / constant)', 'low', (stmt, ctx) => {
  const s = stmt.clean;
  if (/(EXISTS|NOT EXISTS|IN)\s*\(\s*SELECT\s+\*/i.test(s)) {
    return {
      id: 'SQL021', title: 'SELECT * inside EXISTS/IN subquery',
      severity: 'low', line: stmt.startLine,
      snippet: '(SELECT * ...)',
      why: 'Inside EXISTS/IN the engine only cares whether a row exists — column selection is irrelevant. SELECT * there is noise that can confuse optimizers into expanding the planner.',
      fix: 'Use SELECT 1 inside EXISTS, and select only the key column inside IN.',
      estSavings: 'planner clarity',
    };
  }
  return null;
});

// R22 — UNION instead of UNION ALL (forced dedup)
rule('SQL022', 'UNION (not UNION ALL) forces an implicit DISTINCT', 'medium', (stmt, ctx) => {
  const s = stmt.clean;
  if (!/\bUNION\b/i.test(s)) return null;
  if (/\bUNION\s+ALL\b/i.test(s)) return null;
  if (/\bUNION\s+DISTINCT\b/i.test(s)) return null; // explicit, still note
  return {
    id: 'SQL022', title: 'UNION without ALL performs an implicit dedup',
    severity: 'medium', line: stmt.startLine,
    snippet: 'UNION',
    why: 'Plain UNION = UNION DISTINCT — it deduplicates the combined result, requiring a full sort/hash across both branches. If the branches are already disjoint (common), this is wasted work.',
    fix: 'Use UNION ALL when you do not need deduplication. It skips the dedup entirely and is dramatically cheaper.',
    estSavings: 'dedup sort eliminated',
  };
});

// ----------------------------------------------------------------------------
// 4. Severity weights & scoring
// ----------------------------------------------------------------------------

const SEVERITY_WEIGHT = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 1,
};

function scoreHealth(findings) {
  // Start at 100, subtract weighted penalties, floor at 0.
  let penalty = 0;
  for (const f of findings) penalty += SEVERITY_WEIGHT[f.severity] || 0;
  const score = Math.max(0, 100 - penalty);
  let grade = 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else if (score >= 40) grade = 'E';
  return { score, grade, penalty };
}

// ----------------------------------------------------------------------------
// 5. Main audit entry point
// ----------------------------------------------------------------------------

function auditSql(sqlScript, opts) {
  opts = opts || {};
  const rawStatements = splitStatements(String(sqlScript));
  const statementReports = [];
  let allFindings = [];

  for (const stmt of rawStatements) {
    const clean = stripCommentsAndStrings(stmt.sql);
    // Skip SET / USE / BEGIN / COMMIT / bare pragmas — not worth auditing
    if (/^\s*(SET|USE|BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|PRAGMA|CREATE|DROP|ALTER|GRANT|REVOKE|SHOW|DESCRIBE|EXPLAIN|ANALYZE|VACUUM|COPY|INSERT\s+INTO|MERGE)\b/i.test(clean) && !/SELECT/.test(clean)) {
      continue;
    }
    const ctx = { dialect: opts.dialect || 'generic' };
    const stmtFindings = [];
    for (const rule of RULES) {
      try {
        const f = rule.run({ sql: stmt.sql, clean, startLine: stmt.startLine }, ctx);
        if (f) { f.rule = rule.id; stmtFindings.push(f); }
      } catch (e) {
        // a rule throwing should never abort the audit
      }
    }
    if (stmtFindings.length || /\bSELECT\b/i.test(clean) || /\b(DELETE|UPDATE|MERGE)\b/i.test(clean)) {
      statementReports.push({
        startLine: stmt.startLine,
        sqlPreview: stmt.sql.slice(0, 120).replace(/\s+/g, ' '),
        findings: stmtFindings,
      });
      allFindings = allFindings.concat(stmtFindings);
    }
  }

  const { score, grade, penalty } = scoreHealth(allFindings);

  // Prioritized plan: sort findings by severity weight desc, then by estSavings presence
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const prioritizedPlan = allFindings
    .slice()
    .sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || (b.line - a.line));

  // Summary by severity
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of allFindings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;

  // Rule frequency
  const byRule = {};
  for (const f of allFindings) byRule[f.id] = (byRule[f.id] || 0) + 1;

  return {
    dialect: ctx2dialect(opts),
    auditedAt: new Date().toISOString(),
    statementsAudited: statementReports.length,
    healthScore: score,
    grade,
    penalty,
    findings: allFindings,
    bySeverity,
    byRule,
    prioritizedPlan: prioritizedPlan.map(f => ({
      priority: f.severity,
      rule: f.rule,
      title: f.title,
      line: f.line,
      why: f.why,
      fix: f.fix,
      estSavings: f.estSavings,
    })),
    statementBreakdown: statementReports,
    rulesetVersion: '1.0.0',
  };
}

function ctx2dialect(opts) {
  return (opts && opts.dialect) || 'generic';
}

// ----------------------------------------------------------------------------
// 6. CLI
// ----------------------------------------------------------------------------

function cliMain(argv) {
  const fs = require('fs');
  const arg = argv[2];
  const wantJson = argv.includes('--json');
  if (!arg) {
    process.stderr.write('Usage: sql-sentinel.js <file.sql | -> [--json]\n');
    process.exit(2);
  }
  let sql;
  if (arg === '-') {
    sql = fs.readFileSync(0, 'utf8');
  } else {
    sql = fs.readFileSync(arg, 'utf8');
  }
  const report = auditSql(sql, { dialect: 'generic' });
  if (wantJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(prettyReport(report) + '\n');
  }
}

function prettyReport(r) {
  const lines = [];
  lines.push('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
  lines.push('┃                     sql-sentinel audit report                   ┃');
  lines.push('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
  lines.push('');
  lines.push(`  Health score : ${r.healthScore}/100  (grade ${r.grade})`);
  lines.push(`  Statements   : ${r.statementsAudited} audited`);
  lines.push(`  Findings     : ${r.findings.length} total — ${r.bySeverity.critical} critical, ${r.bySeverity.high} high, ${r.bySeverity.medium} medium, ${r.bySeverity.low} low`);
  lines.push('');
  if (!r.findings.length) {
    lines.push('  ✓ No cost/performance anti-patterns detected. Clean query.');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('  ── Prioritized cost-reduction plan ──────────────────────────────');
  lines.push('');
  r.prioritizedPlan.forEach((p, i) => {
    const sev = p.priority.toUpperCase().padEnd(8);
    lines.push(`  [${i + 1}] ${sev} ${p.title}  (rule ${p.rule}, line ${p.line})`);
    lines.push(`       why : ${p.why}`);
    lines.push(`       fix : ${p.fix}`);
    if (p.estSavings) lines.push(`       $   : est. savings — ${p.estSavings}`);
    lines.push('');
  });
  lines.push('  ── Rule frequency ──────────────────────────────────────────────');
  for (const [id, n] of Object.entries(r.byRule)) lines.push(`  ${id.padEnd(8)} ×${n}`);
  lines.push('');
  return lines.join('\n');
}

// Export for programmatic use + CLI
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { auditSql, splitStatements, stripCommentsAndStrings, whereClause, hasWord, scoreHealth, RULES, prettyReport };
}
if (require.main === module) {
  cliMain(process.argv);
}
