// Tiny DOM builder and in-app dialogs (no native alert/confirm).
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  // Set after children so <select> can pick an existing option.
  if (value !== undefined) el.value = value;
  return el;
}

export function openDialog({ title, message, body, okText = 'OK', okClass = 'btn-primary', cancelText = 'Cancel', extra = [] }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' });
    const cancel = h('button', { type: 'button', class: 'btn', onclick: () => dlg.close('') }, cancelText);
    dlg.append(h('form', { method: 'dialog' },
      title && h('h2', {}, title),
      message && h('p', { class: 'muted' }, message),
      body,
      h('div', { class: 'dialog-actions' },
        // The first submit button is the Enter-key default.
        h('button', { value: 'ok', class: `btn ${okClass}` }, okText),
        extra.map((b) => h('button', { value: b.value, class: `btn ${b.class || ''}` }, b.label)),
        cancel)));
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(dlg.returnValue || null);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export async function confirmDialog(opts) {
  return (await openDialog(opts)) === 'ok';
}

export async function promptDialog({ title, label, value = '', okText = 'OK', suggestions = [] }) {
  const listId = `dl-${Math.random().toString(36).slice(2)}`;
  const input = h('input', {
    class: 'input', value, placeholder: label, 'aria-label': label,
    required: true, autocomplete: 'off', list: suggestions.length ? listId : null,
  });
  const body = h('div', { class: 'dialog-body' }, input,
    suggestions.length > 0 && h('datalist', { id: listId }, suggestions.map((s) => h('option', { value: s }))));
  const result = openDialog({ title, body, okText });
  input.focus();
  return (await result) === 'ok' ? input.value.trim() || null : null;
}

// options: [[value, label], ...]
export function segmented(options, value, onchange, label) {
  const wrap = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const draw = () => wrap.replaceChildren(...options.map(([v, text]) => h('button', {
    type: 'button',
    class: v === value ? 'active' : null,
    'aria-pressed': String(v === value),
    onclick: () => {
      if (v === value) return;
      value = v;
      draw();
      onchange(v);
    },
  }, text)));
  draw();
  return wrap;
}

export function toast(message) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}
