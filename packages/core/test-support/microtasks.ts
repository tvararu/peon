export async function flushMicrotasks(): Promise<void> {
  for (let tick = 0; tick < 100; tick++) await Promise.resolve();
}

export async function hasSettled(pending: Promise<unknown>): Promise<boolean> {
  let settled = false;
  const mark = () => {
    settled = true;
  };
  pending.then(mark, mark);
  await flushMicrotasks();
  return settled;
}
