import type { TeamState, AgentState, TaskState, MessageState, WSMessage } from '@agent-viewer/shared';

type Listener = (msg: WSMessage) => void;

export class StateManager {
  private state: TeamState = {
    name: '',
    agents: [],
    tasks: [],
    messages: [],
  };

  private listeners: Set<Listener> = new Set();
  private maxMessages = 200;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private broadcast(msg: WSMessage) {
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch {
        // ignore
      }
    }
  }

  getState(): TeamState {
    return this.state;
  }

  setTeamName(name: string) {
    this.state.name = name;
    this.broadcastFullState();
  }

  setAgents(agents: AgentState[]) {
    this.state.agents = agents;
    this.broadcastFullState();
  }

  updateAgent(agent: AgentState) {
    const idx = this.state.agents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) {
      this.state.agents[idx] = agent;
      this.broadcast({ type: 'agent_update', data: agent });
    } else {
      this.state.agents.push(agent);
      this.broadcast({ type: 'agent_added', data: agent });
    }
  }

  removeAgent(id: string) {
    this.state.agents = this.state.agents.filter((a) => a.id !== id);
    this.broadcast({ type: 'agent_removed', data: { id } });
  }

  updateTask(task: TaskState) {
    const idx = this.state.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      // Track completed tasks for agent evolution
      const oldTask = this.state.tasks[idx];
      if (oldTask.status !== 'completed' && task.status === 'completed' && task.owner) {
        const agent = this.state.agents.find((a) => a.name === task.owner);
        if (agent) {
          agent.tasksCompleted += 1;
          this.broadcast({ type: 'agent_update', data: agent });
        }
      }
      this.state.tasks[idx] = task;
    } else {
      this.state.tasks.push(task);
    }
    this.broadcast({ type: 'task_update', data: task });
  }

  addMessage(message: MessageState) {
    this.state.messages.push(message);
    if (this.state.messages.length > this.maxMessages) {
      this.state.messages = this.state.messages.slice(-this.maxMessages);
    }
    this.broadcast({ type: 'new_message', data: message });
  }

  updateAgentActivity(agentName: string, status: 'idle' | 'working' | 'done', action?: string) {
    const agent = this.state.agents.find((a) => a.name === agentName);
    if (agent) {
      agent.status = status;
      agent.currentAction = action;
      this.broadcast({ type: 'agent_update', data: agent });
    }
  }

  broadcastFullState() {
    this.broadcast({ type: 'full_state', data: this.state });
  }

  reset() {
    this.state = { name: '', agents: [], tasks: [], messages: [] };
    this.broadcastFullState();
  }
}
