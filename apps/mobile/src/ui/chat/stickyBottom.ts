/** 智能吸底判定：只有距底部小于阈值时才认为用户停留在底部。 */
export function shouldStickToBottom(distance: number, threshold = 60): boolean {
  return Number.isFinite(distance) && distance < threshold;
}
