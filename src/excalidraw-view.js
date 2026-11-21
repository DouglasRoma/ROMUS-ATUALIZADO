import {TextFileView, Notice, setIcon} from './compat.js';

export class ExcalidrawView extends TextFileView {
  constructor(leaf) {
    super(leaf);
    this.data = '';
  }
  getViewType() {
    return 'excalidraw';
  }
  getDisplayText() {
    return this.file?.basename || 'Excalidraw';
  }
  getIcon() {
    return 'palette';
  }
  getViewData() {
    return this.data;
  }
  setViewData(data, clear) {
    this.data = data;
    this.render();
  }
  clear() {
    this.data = '';
    this.contentEl.empty();
  }
  async onOpen() {
    this.contentEl.addClass('ia-excalidraw-view');
    this.render();
  }
  render() {
    this.contentEl.empty();
    const container = this.contentEl.createDiv({ cls: 'ia-excalidraw-container', attr: { style: 'display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;padding:12px;' } });
    const header = container.createDiv({ cls: 'ia-excalidraw-header', attr: { style: 'margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;' } });
    const title = header.createEl('h3', { text: this.file?.basename || 'Desenho Excalidraw', attr: { style: 'margin:0;font-size:16px;' } });
    
    const frame = container.createEl('iframe', {
      cls: 'ia-excalidraw-frame',
      attr: {
        src: 'https://excalidraw.com',
        allow: 'clipboard-read; clipboard-write',
        style: 'flex:1;width:100%;height:100%;border:1px solid var(--background-modifier-border);border-radius:8px;'
      }
    });
  }
}
