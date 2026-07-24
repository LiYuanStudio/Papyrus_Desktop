@echo off
echo ==========================================
echo Papyrus 更改推送脚本
echo ==========================================
echo.

echo [1/3] 添加所有更改...
git add -u

echo.
echo [2/3] 提交更改...
git commit -m "feat: 增加发布工作流和扩展支持

- 添加 CHANGELOG.md 自动发布系统
- 创建 release.yml 工作流（暂时禁用）
- 删除旧的 electron-build.yml 和 build-and-release.yml
- 添加扩展开发文档 (EXTENSIONS.md)
- 添加发布指南 (RELEASE.md)
- 创建扩展示例模板
- 更新 README 文档链接
- 优化 .gitignore 配置"

echo.
echo [3/3] 推送到远程...
git push origin HEAD

echo.
echo ==========================================
echo 推送完成！
echo ==========================================
pause
