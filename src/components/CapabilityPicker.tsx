'use client';
import { useState } from 'react';
import { CAPABILITIES, PRESETS, presetFor, type Preset } from '@/lib/capabilities';

/** Preset dropdown that fills the capability checkboxes; ticking one switches the label to "custom". */
export default function CapabilityPicker({ initial = ['reports.view'] }: { initial?: string[] }) {
  const [caps, setCaps] = useState<string[]>(initial);
  const preset: Preset = presetFor(caps);

  return (
    <div>
      <label>Starting point</label>
      <select
        value={preset}
        onChange={(e) => {
          const p = e.target.value as Preset;
          if (p !== 'custom') setCaps([...PRESETS[p].capabilities]);
        }}
        style={{ maxWidth: 260 }}
      >
        {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        <option value="custom">Custom</option>
      </select>
      <label>Capabilities</label>
      <div className="checks">
        {CAPABILITIES.map((c) => (
          <label key={c.key}>
            <input
              type="checkbox" name="capabilities" value={c.key}
              checked={caps.includes(c.key)}
              onChange={(e) => setCaps(e.target.checked ? [...caps, c.key] : caps.filter((x) => x !== c.key))}
            />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}
