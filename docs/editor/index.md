# 编辑文章

<div id="notes-editor" class="notes-editor" hidden>
  <div class="notes-editor__toolbar">
    <strong id="notes-editor-title">正在加载...</strong>
    <div class="notes-editor__actions">
      <button id="notes-editor-cancel" class="md-button" type="button">取消</button>
      <button id="notes-editor-save" class="md-button md-button--primary" type="button">保存并发布</button>
    </div>
  </div>
  <textarea id="notes-editor-content" aria-label="Markdown 内容" spellcheck="false"></textarea>
  <p id="notes-editor-status" class="notes-editor__status" role="status"></p>
</div>

<div id="notes-editor-login" class="notes-editor-login" hidden>
  <h2>需要 GitHub 授权</h2>
  <p>登录后可以读取和修改这个笔记仓库中的 Markdown 文件。</p>
  <button id="notes-editor-login-button" class="md-button md-button--primary" type="button">使用 GitHub 登录</button>
</div>

<div id="notes-editor-error" class="admonition failure" hidden>
  <p class="admonition-title">编辑器暂不可用</p>
  <p id="notes-editor-error-message"></p>
</div>
