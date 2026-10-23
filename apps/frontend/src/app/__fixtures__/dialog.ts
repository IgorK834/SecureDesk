// jsdom has the <dialog> element but neither `showModal()` nor `close()`. This gives it the parts of
// the platform behaviour the dialog components rely on, so the specs run the real components. It
// is installed on the prototype once; excluded from coverage (see __fixtures__).

/** Gives `HTMLDialogElement` working `showModal()`, `close()` and `returnValue`. */
export function installDialogPolyfill(): void {
  const proto = HTMLDialogElement.prototype;

  const returnValues = new WeakMap<HTMLDialogElement, string>();
  Object.defineProperty(proto, 'returnValue', {
    configurable: true,
    get(this: HTMLDialogElement) {
      return returnValues.get(this) ?? '';
    },
    set(this: HTMLDialogElement, value: string) {
      returnValues.set(this, value);
    },
  });

  proto.showModal = function (this: HTMLDialogElement) {
    // As in browsers: a dialog that is already open cannot be opened modally again.
    if (this.hasAttribute('open')) throw new DOMException('Already open', 'InvalidStateError');
    this.setAttribute('open', '');
  };

  proto.close = function (this: HTMLDialogElement, returnValue?: string) {
    if (!this.hasAttribute('open')) return;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

/**
 * What the Escape key does to a modal dialog: a cancelable `cancel` event first, and only if
 * nothing prevented it, the dialog closes (with an empty return value).
 */
export function pressEscape(dialog: HTMLDialogElement): void {
  const cancel = new Event('cancel', { cancelable: true });
  dialog.dispatchEvent(cancel);
  if (!cancel.defaultPrevented) dialog.close();
}
