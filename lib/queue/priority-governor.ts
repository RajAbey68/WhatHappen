/**
 * Priority Governor for Hermes-Dev Workloads
 * 
 * Regulates resource allocation between:
 * - Tier 0 (Interactive): Web UI chat, MCP server tool calls, auth challenge & token verification
 * - Tier 1 (Background): Receipt OCR, WhatsApp media ingest, batch vector re-indexing
 * 
 * Background tasks yield or pause when Tier 0 tasks are actively executing.
 */

class OperationalPriorityGovernor {
  private activeInteractiveRequests: number = 0
  private activeBackgroundTasks: number = 0
  private maxConcurrentBackground: number = 1
  private waitingBackgroundResolvers: Array<() => void> = []

  /**
   * Acquire execution slot for an interactive (Tier 0) task.
   * Interactive tasks ALWAYS execute immediately and pre-empt background work.
   */
  startInteractive(): () => void {
    this.activeInteractiveRequests++
    let released = false

    return () => {
      if (released) return
      released = true
      this.activeInteractiveRequests = Math.max(0, this.activeInteractiveRequests - 1)
      this.drainWaitingBackground()
    }
  }

  /**
   * Acquire execution slot for a background (Tier 1) task.
   * Suspends execution if interactive tasks are running or if max background concurrency is reached.
   */
  async acquireBackgroundSlot(): Promise<() => void> {
    while (this.activeInteractiveRequests > 0 || this.activeBackgroundTasks >= this.maxConcurrentBackground) {
      await new Promise<void>((resolve) => {
        this.waitingBackgroundResolvers.push(resolve)
      })
    }

    this.activeBackgroundTasks++
    let released = false

    return () => {
      if (released) return
      released = true
      this.activeBackgroundTasks = Math.max(0, this.activeBackgroundTasks - 1)
      this.drainWaitingBackground()
    }
  }

  /**
   * Non-blocking check whether background task should yield.
   */
  shouldYieldBackground(): boolean {
    return this.activeInteractiveRequests > 0
  }

  /**
   * Yield point for iterative background jobs (e.g. batch OCR or chunk embedding).
   */
  async yieldIfInteractiveActive(): Promise<void> {
    if (this.shouldYieldBackground()) {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (this.activeInteractiveRequests === 0) {
            clearInterval(interval)
            resolve()
          }
        }, 100)
      })
    }
  }

  private drainWaitingBackground() {
    if (this.activeInteractiveRequests === 0 && this.activeBackgroundTasks < this.maxConcurrentBackground) {
      const next = this.waitingBackgroundResolvers.shift()
      if (next) next()
    }
  }

  getStatus() {
    return {
      activeInteractive: this.activeInteractiveRequests,
      activeBackground: this.activeBackgroundTasks,
      queuedBackground: this.waitingBackgroundResolvers.length
    }
  }
}

export const priorityGovernor = new OperationalPriorityGovernor()
