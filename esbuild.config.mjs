import esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";
const watch = !production;
const outdir = "dist/feishu-importer";
const outfile = `${outdir}/main.js`;

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile,
  logLevel: "info",
  minify: production,
  tsconfig: "tsconfig.json",
});

async function copyStaticFiles() {
  await mkdir(dirname(outfile), { recursive: true });
  await cp("manifest.json", `${outdir}/manifest.json`);
  await cp("versions.json", `${outdir}/versions.json`);
  await cp("styles.css", `${outdir}/styles.css`);
}

if (watch) {
  await mkdir(dirname(outfile), { recursive: true });
  await ctx.watch();
  await copyStaticFiles();
  console.log("watching...");
} else {
  await rm(outdir, { recursive: true, force: true });
  await ctx.rebuild();
  await copyStaticFiles();
  await ctx.dispose();
}
