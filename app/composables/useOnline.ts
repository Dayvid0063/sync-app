const online = ref(navigator.onLine)
let listening = false

/** Reactive navigator.onLine, shared across components. */
export function useOnline() {
  if (!listening) {
    listening = true
    const update = () => { online.value = navigator.onLine }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
  }
  return readonly(online)
}
