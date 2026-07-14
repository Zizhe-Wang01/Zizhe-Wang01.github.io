# Zosia's Notes

这是一个使用 MkDocs Material 搭建的个人笔记网站。

## 本地预览

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

然后访问终端中显示的本地地址。

## 发布

1. 在 GitHub 创建名为 `Zizhe-Wang01.github.io` 的公开仓库。
2. 将本项目全部文件推送到仓库的 `main` 分支。
3. 打开仓库的 `Settings → Pages`。
4. 在 `Build and deployment → Source` 中选择 `GitHub Actions`。
5. 再推送一次提交，或者在 `Actions` 页面手动运行工作流。

发布后的网站地址：

```text
https://zizhe-wang01.github.io/
```
