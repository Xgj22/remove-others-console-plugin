(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('@babel/generator'), require('@babel/parser'), require('@babel/traverse'), require('@vue/compiler-sfc'), require('child_process'), require('fs')) :
  typeof define === 'function' && define.amd ? define(['@babel/generator', '@babel/parser', '@babel/traverse', '@vue/compiler-sfc', 'child_process', 'fs'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.RemoveOthersConsolePlugin = factory(global._generator, global.parser, global._traverse, global.compilerSfc, global.child_process, global.fs));
})(this, (function (_generator, parser, _traverse, compilerSfc, child_process, fs) { 'use strict';

  const generator = _generator.default;
  const traverse = _traverse.default;

  const UNCOMMITTED = "Not";

  const execCommand = (command) => {
    return new Promise((resolve, reject) => {
      child_process.exec(command, (err, stdout, stderr) => {
        if (err) {
          reject(err);
          return;
        }
        if (stderr) {
          reject(new Error(stderr));
          return;
        }
        resolve(stdout.trim());
      });
    });
  };

  let username = null;
  if (!username) {
    execCommand("git config user.name").then((name) => {
      username = name;
    });
  }

  async function getUserMap(url) {
    const blameOutput = await execCommand(`git blame ${url} | nl -n ln`);
    const map = blameOutput
      .trim()
      .split("\n")
      .reduce((acc, line) => {
        const num = parseInt(line.split(" ")[0], 10);
        const author = line
          .split(" ")
          .filter((item) => item.includes("("))[0]
          .trim()
          .replace("(", "");
        acc[num] = author;

        return acc;
      }, {});

    return map;
  }

  function removeConsoleNode(path, map, startLine = 1) {
    if (
      path.node.callee.type === "MemberExpression" &&
      path.node.callee.property.name === "log"
    ) {
      const logLine = path.node.loc.start.line + startLine - 1;
      const commiter = map[logLine];
      if (commiter !== username && commiter !== UNCOMMITTED) {
        path.remove();
      }
    }
  }

  function removeConsolePlugin() {
    return {
      name: "console-remover",
      async load(id) {
        const parseUrl = new URL(id, "file://");
        const url = parseUrl.pathname;
        if (url.includes("/node_modules/") || !url.includes("/src")) return;

        const map = await getUserMap(url);
        const isJsOrTsFile = /\.([tj]sx?|js|ts)$/.test(url);
        const isVueFile = /\.vue$/.test(url);

        if (isJsOrTsFile) {
          let originalContent = fs.readFileSync(url, "utf-8");
          const ast = parser.parse(originalContent, {
            sourceType: "module",
            plugins: ["jsx", "typescript"],
          });
          traverse(ast, {
            CallExpression(path) {
              removeConsoleNode(path, map);
            },
          });
          const { code } = generator(ast);
          return code;
        }

        if (isVueFile) {
          let originalContent = fs.readFileSync(url, "utf-8");
          // 解析 .vue 文件
          const { descriptor } = compilerSfc.parse(originalContent);

          const startLine =
            descriptor.scriptSetup?.loc.start.line ||
            descriptor.script?.loc.start.line ||
            1;
          const scriptContent =
            descriptor.scriptSetup?.content || descriptor.script?.content || "";
          // 使用 Babel 解析脚本内容为 AST
          const ast = parser.parse(scriptContent, {
            sourceType: "module",
            plugins: ["jsx", "typescript"],
          });
          traverse(ast, {
            CallExpression: (path) => removeConsoleNode(path, map, startLine),
          });

          const { code: modifiedScriptContent } = generator(ast);

          // 替换原始 script 内容
          const modifiedFileContent =
            scriptContent.length > 0
              ? originalContent.replace(scriptContent, modifiedScriptContent)
              : originalContent;
          return modifiedFileContent;
        }
      },
    };
  }

  return removeConsolePlugin;

}));
