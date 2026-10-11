/** Shared envelope type for war-room components (mirrors the SDK's Envelope). */
export interface Envelope<T> {
  recordId: string
  data: T
  createdBy: string
  createdAt: string
  updatedAt: string
}
