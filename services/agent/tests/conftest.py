import sys
import os

agent_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if agent_root not in sys.path:
    sys.path.insert(0, agent_root)

repo_root = os.path.dirname(agent_root)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
