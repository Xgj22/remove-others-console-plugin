import generator from "@babel/generator";
import { parse as parseBabel } from "@babel/parser";
import traverse from "@babel/traverse";
import { parse as parseVue } from "@vue/compiler-sfc";
import { exec } from "child_process";
import fs from "fs";

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
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
      let [numStr, hash, author, ...rest] = line.split(/\s+/);
      let num = parseInt(numStr, 10);
      acc[num] = author.replace("(", "").replace(")", "");
      return acc;
    }, {});

  return map;
}

function removeConsoleNode(path, map) {
  if (
    path.node.callee.type === "MemberExpression" &&
    path.node.callee.property.name === "log"
  ) {
    const logLine = path.node.loc.start.line;
    const commiter = map[logLine];
    if (commiter !== username && commiter !== "Not") {
      path.remove();
    }
  }
}

export default function removeConsolePlugin() {
  return {
    name: "console-remover",
    async load(id) {
      const parseUrl = new URL(id, "file://");
      const url = parseUrl.pathname;
      if (!url.includes("/src")) return;

      const map = await getUserMap(url);
      const isJsOrTsFile = /\.([tj]sx?|js|ts)$/.test(url);
      const isVueFile = /\.vue$/.test(url);

      if (isJsOrTsFile) {
        let originalContent = fs.readFileSync(url, "utf-8");
        const ast = parseBabel(originalContent, {
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
        const { descriptor } = parseVue(originalContent);

        const scriptContent =
          descriptor.scriptSetup?.content || descriptor.script?.content || "";
        // 使用 Babel 解析脚本内容为 AST
        const ast = parseBabel(scriptContent, {
          sourceType: "module",
          plugins: ["jsx", "typescript"],
        });
        traverse(ast, {
          CallExpression: (path) => removeConsoleNode(path, map),
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
