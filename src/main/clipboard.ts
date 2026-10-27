import { clipboard } from 'electron';

/** 剪贴板快照：保存文本 / HTML / RTF / 图片，用于操作前后完整恢复。 */
export interface ClipboardSnapshot {
  text: string;
  html: string;
  rtf: string;
  image: Electron.NativeImage;
}

/**
 * ClipboardService：封装剪贴板的快照 / 写入 / 读取 / 恢复。
 *
 * 抓取选中文本与插入话术都会短暂占用剪贴板，必须在使用前保存快照、
 * 使用后恢复，保证「剪贴板不留痕」。
 */
export class ClipboardService {
  /** 读取当前剪贴板全部内容形成快照。 */
  capture(): ClipboardSnapshot {
    return {
      text: clipboard.readText(),
      html: clipboard.readHTML(),
      rtf: clipboard.readRTF(),
      image: clipboard.readImage(),
    };
  }

  /** 恢复剪贴板到指定快照。 */
  restore(snapshot: ClipboardSnapshot): void {
    clipboard.write({
      text: snapshot.text,
      html: snapshot.html,
      rtf: snapshot.rtf,
      image: snapshot.image,
    });
  }

  /** 写入纯文本。 */
  writeText(text: string): void {
    clipboard.writeText(text);
  }

  /** 读取纯文本。 */
  readText(): string {
    return clipboard.readText();
  }
}
