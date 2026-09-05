/**
 * Biome Shifters — Storage Manager
 * Handles REST API integration with server.py for saving/loading simulation states.
 */

export class StorageManager {
  static async listSaves() {
    try {
      const res = await fetch('/api/saves');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.saves || [];
    } catch (err) {
      console.warn('Failed to fetch saves from server:', err);
      return [];
    }
  }

  static async loadSave(filename) {
    try {
      const res = await fetch(`/api/saves/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to load save ${filename}:`, err);
      throw err;
    }
  }

  static async saveSimulation(simulation, customName = '') {
    try {
      const name = customName.trim() || `save_${Date.now()}`;
      const payload = simulation.toJSON(name);
      const res = await fetch('/api/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to save simulation to server:', err);
      throw err;
    }
  }

  static async deleteSave(filename) {
    try {
      const res = await fetch(`/api/saves/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to delete save ${filename}:`, err);
      throw err;
    }
  }
}

