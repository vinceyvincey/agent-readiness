// BUG: this returns n-1 instead of n (off-by-one). Fix so it returns n.
export const count = (n: number) => n - 1;
