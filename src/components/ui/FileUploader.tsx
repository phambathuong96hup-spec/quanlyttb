import React, { memo, useEffect, useId, useState } from 'react';
import { FileText, FileVideo, Images, Upload, X } from 'lucide-react';
import {
  DEFAULT_REPAIR_ATTACHMENT_LIMITS,
  REPAIR_ATTACHMENT_ACCEPT,
  attachmentKey,
  formatAttachmentSize,
  getAttachmentMimeType,
  getTotalAttachmentSize,
  mergeAttachmentSelection,
} from '../../utils/attachmentUtils';
import './FileUploader.css';

interface FileUploaderProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  maxSizeMB?: number;
  maxTotalSizeMB?: number;
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  helperText?: string;
}

const AttachmentThumbnail = memo(({ file }: { file: File }) => {
  const isImage = getAttachmentMimeType(file).startsWith('image/');
  const [previewUrl] = useState(() => isImage ? URL.createObjectURL(file) : '');

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!isImage) {
    return (
      <span className="file-uploader-file-icon is-video" aria-hidden="true">
        <FileVideo size={20} />
      </span>
    );
  }

  return (
    <img
      className="file-uploader-thumbnail"
      src={previewUrl}
      alt={`Xem trước ${file.name}`}
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
    />
  );
});

AttachmentThumbnail.displayName = 'AttachmentThumbnail';

const attachmentKindLabel = (file: File) => {
  const mimeType = getAttachmentMimeType(file);
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('image/')) return 'Ảnh';
  return 'Tài liệu';
};

export const FileUploader: React.FC<FileUploaderProps> = ({
  files,
  onFilesChange,
  accept = REPAIR_ATTACHMENT_ACCEPT,
  maxSizeMB = DEFAULT_REPAIR_ATTACHMENT_LIMITS.maxSizeMB,
  maxTotalSizeMB = DEFAULT_REPAIR_ATTACHMENT_LIMITS.maxTotalSizeMB,
  maxFiles = 1,
  multiple = false,
  disabled = false,
  label = 'Tệp minh chứng (tùy chọn)',
  helperText = 'Hỗ trợ ảnh JPG, PNG, WebP và video MP4, MOV, WebM',
}) => {
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const actionId = `${inputId}-action`;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const selectFiles = (incomingFiles: File[]) => {
    if (disabled || incomingFiles.length === 0) return;
    const baseFiles = multiple ? files : [];
    const candidates = multiple ? incomingFiles : incomingFiles.slice(0, 1);
    const result = mergeAttachmentSelection(baseFiles, candidates, {
      accept,
      maxFiles: multiple ? maxFiles : 1,
      maxSizeMB,
      maxTotalSizeMB,
    });
    setErrors(result.errors);
    onFilesChange(result.files);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    selectFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFiles(Array.from(event.dataTransfer.files || []));
  };

  const removeFile = (file: File) => {
    onFilesChange(files.filter(item => attachmentKey(item) !== attachmentKey(file)));
    setErrors([]);
  };

  const totalSize = getTotalAttachmentSize(files);

  return (
    <div
      className={`file-uploader ${disabled ? 'is-disabled' : ''}`}
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : 'Tải tệp minh chứng'}
    >
      {label ? <span id={labelId} className="file-uploader-label">{label}</span> : null}
      <input
        className="file-uploader-input"
        type="file"
        id={inputId}
        onChange={handleFileChange}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-labelledby={label ? `${labelId} ${actionId}` : actionId}
        aria-describedby={`${helperId}${errors.length > 0 ? ` ${errorId}` : ''}`}
        aria-invalid={errors.length > 0 || undefined}
      />
      <label
        className={`file-uploader-dropzone ${isDragging ? 'is-dragging' : ''}`}
        htmlFor={inputId}
        onDragEnter={event => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <span className="file-uploader-upload-icon" aria-hidden="true">
          {multiple ? <Images size={24} /> : <Upload size={24} />}
        </span>
        <span id={actionId} className="file-uploader-action">
          {multiple ? 'Chọn nhiều ảnh hoặc video' : 'Chọn tệp minh chứng'}
        </span>
        <span className="file-uploader-drop-copy">hoặc kéo thả vào đây</span>
      </label>
      <span id={helperId} className="file-uploader-helper">
        {helperText}. Tối đa {maxFiles} tệp, {maxSizeMB} MB/tệp và {maxTotalSizeMB} MB tổng cộng.
      </span>

      <div className="file-uploader-status" aria-live="polite">
        {files.length > 0
          ? `Đã chọn ${files.length}/${maxFiles} tệp · ${formatAttachmentSize(totalSize)}`
          : 'Chưa chọn tệp minh chứng.'}
      </div>

      {errors.length > 0 ? (
        <ul id={errorId} className="file-uploader-errors" role="alert">
          {errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="file-uploader-file-list" aria-label="Các tệp đã chọn">
          {files.map(file => (
            <li key={attachmentKey(file)} className="file-uploader-file">
              {getAttachmentMimeType(file).startsWith('video/')
                ? <AttachmentThumbnail file={file} />
                : getAttachmentMimeType(file).startsWith('image/')
                  ? <AttachmentThumbnail file={file} />
                  : (
                    <span className="file-uploader-file-icon" aria-hidden="true">
                      <FileText size={20} />
                    </span>
                  )}
              <span className="file-uploader-file-copy">
                <strong title={file.name}>{file.name}</strong>
                <small>{formatAttachmentSize(file.size)} · {attachmentKindLabel(file)}</small>
              </span>
              <button
                type="button"
                className="file-uploader-remove"
                onClick={() => removeFile(file)}
                disabled={disabled}
                aria-label={`Xóa ${file.name}`}
                title={`Xóa ${file.name}`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
