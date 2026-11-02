let fails = 0;
export const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) fails++;
  console.log((cond ? "OK   " : "FAIL ") + name + (extra ? "  " + extra : ""));
};
export const done = () => {
  console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTout passe");
  process.exit(fails ? 1 : 0);
};
