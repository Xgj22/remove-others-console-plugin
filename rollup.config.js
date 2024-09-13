module.exports = {
  input: "src/index.js", // 入口文件路径
  output: [
    {
      file: "dist/index.cjs.js", // CommonJS 格式输出文件路径
      format: "cjs", // CommonJS 格式
    },
    {
      file: "dist/index.esm.js", // ES Module 格式输出文件路径
      format: "es", // ES Module 格式
    },
    {
      file: "dist/index.umd.js", // UMD 格式输出文件路径
      format: "umd", // UMD 格式
      name: "RemoveOthersConsolePlugin", // UMD 模块名称
    },
  ],
};
