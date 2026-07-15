# 编辑文章

<div id="notes-editor-create" class="notes-editor-create" hidden>
  <div class="notes-editor-create__heading">
    <div>
      <h2>新建文章</h2>
      <p>创建后会自动加入左侧目录，并打开 Markdown 编辑器。</p>
    </div>
    <button id="notes-editor-create-cancel" class="md-button" type="button">取消</button>
  </div>
  <label for="notes-editor-section">所属栏目</label>
  <select id="notes-editor-section">
    <option value="ai">算法和 Agent</option>
    <option value="rl">强化学习系列</option>
    <option value="agentic">Agentic RL 系列</option>
    <option value="robotics">具身智能</option>
    <option value="notes">随笔</option>
  </select>
  <label for="notes-editor-new-title">文章标题</label>
  <input id="notes-editor-new-title" type="text" maxlength="120" placeholder="例如：策略梯度入门" autocomplete="off">
  <label for="notes-editor-new-slug">URL 名称</label>
  <input id="notes-editor-new-slug" type="text" maxlength="80" placeholder="例如：policy-gradient" autocomplete="off" spellcheck="false">
  <p class="notes-editor-create__hint">使用小写英文字母、数字和连字符；它会成为文章网址的一部分。</p>
  <button id="notes-editor-create-submit" class="md-button md-button--primary" type="button">创建并开始编辑</button>
  <p id="notes-editor-create-status" class="notes-editor__status" role="status"></p>

  <section class="notes-directory-manager">
    <h2>管理目录</h2>
    <p>可以建立顶级目录或系列，也可以直接修改已有目录名称。</p>
    <div class="notes-directory-manager__new">
      <label for="notes-directory-parent">上级目录</label>
      <select id="notes-directory-parent"></select>
      <label for="notes-directory-title">新目录名称</label>
      <input id="notes-directory-title" type="text" maxlength="120" placeholder="例如：大语言模型" autocomplete="off">
      <label for="notes-directory-slug">目录 URL 名称</label>
      <input id="notes-directory-slug" type="text" maxlength="80" placeholder="例如：llm" autocomplete="off" spellcheck="false">
      <button id="notes-directory-create" class="md-button" type="button">新建目录</button>
    </div>
    <p id="notes-directory-status" class="notes-editor__status" role="status"></p>
    <div id="notes-directory-list" class="notes-directory-list"></div>
  </section>
</div>

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
