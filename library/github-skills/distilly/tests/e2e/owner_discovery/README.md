# End-to-end test: owner source discovery

Runs the owner-profile flow in a real Claude Code CLI against a throwaway HOME
with four mock MCP connectors (`gmail`, `google-calendar`, `x`, `weather`) that
serve fictional data, plus an X archive in `~/Downloads`. Nothing in the prompt
tells the agent which sources exist; it has to discover them through Distilly.

It needs the `claude` CLI and a signed-in account, and it spends model tokens,
so it is not part of `unittest discover`.

```bash
./setup.sh                      # fresh HOME, install Distilly, register mock connectors
./turn.sh 1 "帮我用 Distilly 初始化一下我的个人画像"
./turn.sh 2 "1、2、3、5 都用，归档文件先不用。别的没有要补充的了。"
./turn.sh 3 "<answers to the remaining questions>"
./turn.sh 4 "没问题，保存吧，然后给我看 dry-run。"
./turn.sh 5 "写入吧。"
cat mcp_calls.log home/.claude/CLAUDE.md home/.distilly/owner/profile.md
```

The numbering in turn 2 depends on the list the agent proposed in turn 1.
`mcp_calls.log` records every connector call, so you can check that only the
chosen sources were read and no write tool (`send_message`, `create_post`) was
called. Recorded runs are kept out of the repository.
