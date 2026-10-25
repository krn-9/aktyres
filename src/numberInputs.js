// A number box must not change when the mouse wheel or the arrow keys are used while it is focused:
// scrolling the page with the cursor over an amount used to change the amount.
export function lockNumberInputs() {
  document.addEventListener('wheel', (e) => {
    const el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.type === 'number' && el === e.target) el.blur();
  }, { passive: true });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (el && el.tagName === 'INPUT' && el.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) e.preventDefault();
  });
}
