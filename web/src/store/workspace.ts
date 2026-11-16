export const markdownFile = /\.(md|markdown|txt)$/i;
export const mediaFile = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|tiff?|mp4|webm|mp3|wav|pdf)$/i;

export function folderPath(file: File) {
  const path = file.webkitRelativePath;
  return path ? path.slice(path.indexOf('/') + 1) : file.name;
}

export interface WorkspaceDirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterable<FileSystemFileHandle | WorkspaceDirectoryHandle>;
}

export type DirectoryPicker = (options: { mode: 'readwrite' }) => Promise<WorkspaceDirectoryHandle>;

export interface Workspace {
  name: string;
  documents: string[];
  read(path: string): Promise<File | undefined>;
  /** Only available for directory handles; enables file watching and session restore. */
  handleFor?: (path: string) => FileSystemFileHandle | undefined;
  save?: (path: string, content: string) => Promise<void>;
}

export function workspaceFromFiles(files: FileList): Workspace {
  const entries = new Map(Array.from(files, (file) => [folderPath(file), file]));
  return {
    name: files[0]?.webkitRelativePath.split('/')[0] ?? '',
    documents: [...entries.keys()].filter((path) => markdownFile.test(path)).sort(),
    read: async (path) => entries.get(path),
  };
}

export async function workspaceFromDirectory(root: WorkspaceDirectoryHandle): Promise<Workspace> {
  const documents = new Map<string, FileSystemFileHandle>();

  async function scan(directory: WorkspaceDirectoryHandle, prefix: string) {
    for await (const entry of directory.values()) {
      const path = prefix + entry.name;
      if (entry.kind === 'directory') {
        await scan(entry, path + '/');
      } else if (markdownFile.test(entry.name)) {
        documents.set(path, entry);
      }
    }
  }

  await scan(root, '');
  return {
    name: root.name,
    documents: [...documents.keys()].sort(),
    handleFor(path) {
      return documents.get(path);
    },
    async read(path) {
      const document = documents.get(path);
      if (document) return document.getFile();

      const parts = path.split('/');
      const filename = parts.pop()!;
      let directory: FileSystemDirectoryHandle = root;
      try {
        for (const part of parts) directory = await directory.getDirectoryHandle(part);
        return await (await directory.getFileHandle(filename)).getFile();
      } catch (error) {
        if (error instanceof DOMException && ['NotFoundError', 'TypeMismatchError'].includes(error.name)) return;
        throw error;
      }
    },
    async save(path, content) {
      const document = documents.get(path);
      if (!document) throw new Error('找不到要保存的 Markdown 文件');
      const writer = await document.createWritable();
      await writer.write(content);
      await writer.close();
    },
  };
}
