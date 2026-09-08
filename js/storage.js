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

  static async saveSimulation(simulationOrData, customName = '', isAutosave = false) {
    try {
      const name = customName.trim() || `save_${Date.now()}`;
      let payload;
      if (simulationOrData && typeof simulationOrData.toJSON === 'function') {
        payload = simulationOrData.toJSON(name);
      } else if (typeof simulationOrData === 'object') {
        payload = { ...simulationOrData };
        payload.name = payload.name || name;
      } else {
        throw new Error('Invalid simulation data to save');
      }
      payload.isAutosave = Boolean(isAutosave);
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

  static async clearAutosaves(allSaves) {
    const autosaves = (allSaves || []).filter(s => s.isAutosave);
    const deletePromises = autosaves.map(s => this.deleteSave(s.filename).catch(() => null));
    await Promise.all(deletePromises);
    return autosaves.length;
  }
}

