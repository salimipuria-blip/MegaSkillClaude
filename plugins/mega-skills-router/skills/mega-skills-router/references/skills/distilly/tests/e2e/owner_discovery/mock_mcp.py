#!/usr/bin/env python3
"""Tiny stdio MCP server with fixture data, for an end-to-end test of Distilly's owner discovery."""
import json
import sys
import datetime
import os

KIND = sys.argv[1]
LOG = os.environ.get("MOCK_MCP_LOG", "/tmp/mock_mcp_calls.log")

FIXTURES = {
  "gmail": {
    "tools": [
      {"name": "search_messages", "description": "Search the user's Gmail mailbox. Use query 'in:sent' for messages the user sent.",
       "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "max_results": {"type": "integer"}}, "required": ["query"]}},
      {"name": "send_message", "description": "Send an email from the user's Gmail account.",
       "inputSchema": {"type": "object", "properties": {"to": {"type": "string"}, "body": {"type": "string"}}, "required": ["to", "body"]}},
    ],
    "data": {"search_messages": [
      {"to": "design-team", "subject": "Re: tokens v2", "date": "2026-10-08", "body": "Looks good. Two nits on spacing, otherwise ship it. — Lin"},
      {"to": "manager", "subject": "Thursday 1:1", "date": "2026-10-07", "body": "Can we move to 15:00? Mornings are my focus block. Thanks! — Lin"},
      {"to": "vendor", "subject": "发票", "date": "2026-10-03", "body": "您好，请把发票抬头改成公司全称，谢谢。— 林"},
      {"to": "friend", "subject": "climbing sat?", "date": "2026-10-01", "body": "in! 10am at the usual gym? — L"},
    ]},
  },
  "google-calendar": {
    "tools": [
      {"name": "list_events", "description": "List events on the user's primary Google Calendar between two dates.",
       "inputSchema": {"type": "object", "properties": {"time_min": {"type": "string"}, "time_max": {"type": "string"}}}},
    ],
    "data": {"list_events": [
      {"title": "Daily standup", "when": "Mon-Fri 10:00-10:15", "recurring": True},
      {"title": "Focus: no meetings", "when": "Tue & Thu 09:00-12:00", "recurring": True},
      {"title": "Design crit", "when": "Wed 14:00-15:00", "recurring": True},
      {"title": "Gym", "when": "Wed 19:00-20:00", "recurring": True},
      {"title": "Climbing", "when": "Sat 10:00-12:00", "recurring": False},
    ]},
  },
  "x": {
    "tools": [
      {"name": "get_my_profile", "description": "Get the authenticated user's own X profile (bio, handle).",
       "inputSchema": {"type": "object", "properties": {}}},
      {"name": "get_my_posts", "description": "Get recent posts and replies written by the authenticated X user.",
       "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer"}}}},
      {"name": "create_post", "description": "Publish a new post on X as the user.",
       "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
    ],
    "data": {
      "get_my_profile": {"handle": "@linmakes", "bio": "Product designer. Design systems, AI agents, bouldering. Shanghai."},
      "get_my_posts": [
        {"date": "2026-10-09", "text": "Hot take: most agent UIs fail because they hide what the agent is about to do. Show the plan first."},
        {"date": "2026-10-05", "text": "Shipped tokens v2 today. Fewer variables, more meaning."},
        {"date": "2026-10-02", "text": "设计系统不是组件库，是团队的共同语言。"},
        {"date": "2026-09-28", "text": "Weekend: two V4s at the gym, zero Figma. Perfect."},
      ],
    },
  },
  "weather": {
    "tools": [
      {"name": "get_forecast", "description": "Get the weather forecast for a city.",
       "inputSchema": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}},
    ],
    "data": {"get_forecast": {"city": "Shanghai", "forecast": "sunny"}},
  },
}

spec = FIXTURES[KIND]

def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)
    method, rid = req.get("method"), req.get("id")
    if rid is None:
        continue
    if method == "initialize":
        send({"jsonrpc": "2.0", "id": rid, "result": {
            "protocolVersion": req["params"].get("protocolVersion", "2025-06-18"),
            "capabilities": {"tools": {}}, "serverInfo": {"name": KIND, "version": "0.0.1"}}})
    elif method == "tools/list":
        send({"jsonrpc": "2.0", "id": rid, "result": {"tools": spec["tools"]}})
    elif method == "tools/call":
        name = req["params"]["name"]
        with open(LOG, "a") as f:
            f.write(json.dumps({"server": KIND, "tool": name, "args": req["params"].get("arguments", {}),
                                "at": datetime.datetime.now().isoformat(timespec="seconds")}) + "\n")
        if name in spec["data"]:
            result = spec["data"][name]
        else:
            result = {"error": "write actions are disabled in this test"}
        send({"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}})
    else:
        send({"jsonrpc": "2.0", "id": rid, "result": {}})
