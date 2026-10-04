/** Stylesheets imported with `with { type: "text" }` are bundled as plain strings. */
declare module "*.css" {
  const text: string;
  export default text;
}
