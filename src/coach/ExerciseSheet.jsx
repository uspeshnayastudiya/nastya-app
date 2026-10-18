import { useState } from 'preact/hooks';
import { num, parseNum } from '../lib/logic.js';
import { Btn, Field, Seg, Sheet } from '../ui/kit.jsx';

// Редактор одного упражнения. withWeight = false для шаблонов (вес берётся из истории клиентки).
export function ExerciseSheet({ ex, withWeight = true, names = [], onSave, onDelete, onClose }) {
  const [v, setV] = useState(() => ({
    name: ex?.name || '',
    sets: String(ex?.sets || 3),
    reps_min: ex?.reps_min != null ? String(ex.reps_min) : '10',
    reps_max: ex?.reps_max != null ? String(ex.reps_max) : '12',
    unit: ex?.unit || 'kg',
    per_hand: !!ex?.per_hand,
    weight: ex?.weight != null ? num(ex.weight) : '',
    step: ex?.step != null ? num(ex.step) : '2,5',
  }));
  const [err, setErr] = useState('');
  const set = (k, val) => setV((x) => ({ ...x, [k]: val }));

  function save() {
    const name = v.name.trim();
    const sets = parseInt(v.sets, 10);
    const rmin = parseInt(v.reps_min, 10);
    const rmax = parseInt(v.reps_max, 10) || rmin;
    if (!name) return setErr('Впиши название.');
    if (!Number.isFinite(sets) || sets < 1 || sets > 20) return setErr('Подходов от 1 до 20.');
    if (!Number.isFinite(rmin) || rmin < 1) return setErr(v.unit === 'sec' ? 'Впиши секунды.' : 'Впиши повторы.');
    onSave({
      ...(ex || {}),
      name,
      sets,
      reps_min: Math.min(rmin, rmax),
      reps_max: Math.max(rmin, rmax),
      unit: v.unit,
      per_hand: v.unit === 'kg' ? v.per_hand : false,
      weight: v.unit === 'kg' && withWeight ? parseNum(v.weight) : withWeight ? null : undefined,
      step: v.unit === 'kg' ? parseNum(v.step) : null,
    });
  }

  return (
    <Sheet title={ex ? 'Упражнение' : 'Новое упражнение'} onClose={onClose}>
      <Field label="НАЗВАНИЕ" id="e-name">
        <input id="e-name" class="input" list="ex-names" value={v.name} onInput={(e) => set('name', e.currentTarget.value)} placeholder="Ягодичный мост" />
        <datalist id="ex-names">
          {names.map((n) => <option value={n} />)}
        </datalist>
      </Field>
      <div class="field">
        <span class="hud">ЧЕМ МЕРИМ</span>
        <Seg label="Единица" value={v.unit} onChange={(u) => set('unit', u)} options={[{ value: 'kg', label: 'Вес' }, { value: 'sec', label: 'Секунды' }, { value: 'none', label: 'Без веса' }]} />
      </div>
      <div class="grid3" style={{ gap: '10px' }}>
        <Field label="ПОДХОДЫ" id="e-sets">
          <input id="e-sets" class="input" inputMode="numeric" value={v.sets} onInput={(e) => set('sets', e.currentTarget.value)} />
        </Field>
        <Field label={v.unit === 'sec' ? 'СЕК ОТ' : 'ПОВТ ОТ'} id="e-rmin">
          <input id="e-rmin" class="input" inputMode="numeric" value={v.reps_min} onInput={(e) => set('reps_min', e.currentTarget.value)} />
        </Field>
        <Field label="ДО" id="e-rmax">
          <input id="e-rmax" class="input" inputMode="numeric" value={v.reps_max} onInput={(e) => set('reps_max', e.currentTarget.value)} />
        </Field>
      </div>
      {v.unit === 'kg' && (
        <>
          <div class="grid2" style={{ gap: '10px' }}>
            {withWeight && (
              <Field label="ВЕС, КГ" id="e-w">
                <input id="e-w" class="input" inputMode="decimal" value={v.weight} onInput={(e) => set('weight', e.currentTarget.value)} placeholder="из истории" />
              </Field>
            )}
            <Field label="ШАГ, КГ" id="e-step">
              <input id="e-step" class="input" inputMode="decimal" value={v.step} onInput={(e) => set('step', e.currentTarget.value)} />
            </Field>
          </div>
          <label class="check">
            <input type="checkbox" checked={v.per_hand} onChange={(e) => set('per_hand', e.currentTarget.checked)} />
            <span>Гантели в обе руки (вес одной)</span>
          </label>
        </>
      )}
      {err && <p class="small" style={{ color: 'var(--ogonek)' }} role="alert">{err}</p>}
      <Btn onClick={save}>Готово</Btn>
      {onDelete && (
        <button class="link-btn" style={{ color: 'var(--ogonek)' }} onClick={onDelete}>Убрать упражнение</button>
      )}
    </Sheet>
  );
}
