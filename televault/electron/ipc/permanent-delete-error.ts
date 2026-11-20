/** User-facing message for a permanent delete that failed mid-sweep. */
export function permanentDeleteFailureMessage(reason: string): string {
  return `Delete permanently failed: ${reason}. Some Telegram messages may already have been deleted, so the file may be incomplete. The item is still in Trash and will be retried. Please try again.`
}
