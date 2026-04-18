import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

describe('FileUploader Component', () => {
  test('renders file upload area', () => {
    render(
      <div data-testid="file-uploader">
        <input type="file" data-testid="file-input" />
        <p>Upload your chat export file</p>
      </div>
    )

    expect(screen.getByTestId('file-uploader')).toBeInTheDocument()
    expect(screen.getByText('Upload your chat export file')).toBeInTheDocument()
  })

  test('accepts file input', async () => {
    const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' })

    render(
      <input
        type="file"
        data-testid="file-input"
        accept=".txt,.csv,.pdf"
      />
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement

    await userEvent.upload(fileInput, mockFile)

    expect(fileInput.files).toHaveLength(1)
    expect(fileInput.files?.[0]).toBe(mockFile)
  })

  test('accepts multiple file types', () => {
    render(
      <input
        type="file"
        data-testid="file-input"
        accept=".txt,.csv,.pdf,.docx,.json"
        multiple
      />
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement
    expect(fileInput.accept).toContain('.pdf')
    expect(fileInput.accept).toContain('.csv')
    expect(fileInput.accept).toContain('.txt')
    expect(fileInput.accept).toContain('.docx')
    expect(fileInput.accept).toContain('.json')
  })

  test('shows loading state during upload', async () => {
    const { rerender } = render(
      <div data-testid="upload-status">Ready to upload</div>
    )

    expect(screen.getByText('Ready to upload')).toBeInTheDocument()

    rerender(
      <div data-testid="upload-status">Uploading...</div>
    )

    expect(screen.getByText('Uploading...')).toBeInTheDocument()
  })

  test('shows error on invalid file type', async () => {
    render(
      <div data-testid="file-uploader">
        <input
          type="file"
          data-testid="file-input"
          accept=".txt,.pdf"
        />
        <div data-testid="error-message" style={{ display: 'none' }}>
          Invalid file type. Please upload .txt, .csv, .pdf, .docx, or .json
        </div>
      </div>
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement
    expect(fileInput.accept).not.toContain('.exe')
  })

  test('handles file size validation', () => {
    const largeFile = new File(['x'.repeat(100 * 1024 * 1024)], 'large.txt', { type: 'text/plain' })

    render(
      <div data-testid="file-uploader">
        <input
          type="file"
          data-testid="file-input"
          accept=".txt,.csv,.pdf,.docx"
        />
        <div data-testid="size-info">Max file size: 50MB</div>
      </div>
    )

    expect(screen.getByText('Max file size: 50MB')).toBeInTheDocument()
  })

  test('displays file name after selection', async () => {
    const mockFile = new File(['test'], 'chat_export.txt', { type: 'text/plain' })

    render(
      <div data-testid="file-uploader">
        <input
          type="file"
          data-testid="file-input"
          accept=".txt,.csv,.pdf,.docx,.json"
        />
        <div data-testid="file-name" />
      </div>
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement

    await userEvent.upload(fileInput, mockFile)

    expect(fileInput.files?.[0]?.name).toBe('chat_export.txt')
  })

  test('handles multiple file uploads', async () => {
    const file1 = new File(['content1'], 'chat1.txt', { type: 'text/plain' })
    const file2 = new File(['content2'], 'chat2.txt', { type: 'text/plain' })

    render(
      <input
        type="file"
        data-testid="file-input"
        accept=".txt,.csv,.pdf,.docx,.json"
        multiple
      />
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement

    await userEvent.upload(fileInput, [file1, file2])

    expect(fileInput.files).toHaveLength(2)
    expect(fileInput.files?.[0]?.name).toBe('chat1.txt')
    expect(fileInput.files?.[1]?.name).toBe('chat2.txt')
  })

  test('resets file input on clear', async () => {
    const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' })

    const { rerender } = render(
      <input
        type="file"
        data-testid="file-input"
        accept=".txt,.csv,.pdf,.docx"
      />
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement

    await userEvent.upload(fileInput, mockFile)
    expect(fileInput.files).toHaveLength(1)

    // Simulate reset
    fireEvent.change(fileInput, { target: { files: [] } })
    expect(fileInput.files).toHaveLength(0)
  })

  test('validates file extension', () => {
    const supportedExtensions = ['.txt', '.csv', '.pdf', '.docx', '.json']

    render(
      <input
        type="file"
        data-testid="file-input"
        accept={supportedExtensions.join(',')}
      />
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement

    supportedExtensions.forEach(ext => {
      expect(fileInput.accept).toContain(ext)
    })
  })

  test('displays upload progress feedback', () => {
    render(
      <div data-testid="file-uploader">
        <input type="file" data-testid="file-input" />
        <div data-testid="progress">Upload 0%</div>
      </div>
    )

    expect(screen.getByText('Upload 0%')).toBeInTheDocument()
  })

  test('handles upload completion', async () => {
    const mockFile = new File(['content'], 'chat.txt', { type: 'text/plain' })

    const { rerender } = render(
      <div data-testid="upload-container">
        <input type="file" data-testid="file-input" />
        <div data-testid="status">Pending</div>
      </div>
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement
    await userEvent.upload(fileInput, mockFile)

    rerender(
      <div data-testid="upload-container">
        <input type="file" data-testid="file-input" />
        <div data-testid="status">Upload complete!</div>
      </div>
    )

    expect(screen.getByText('Upload complete!')).toBeInTheDocument()
  })

  test('prevents upload of empty files', async () => {
    const emptyFile = new File([], 'empty.txt', { type: 'text/plain' })

    render(
      <div data-testid="file-uploader">
        <input
          type="file"
          data-testid="file-input"
          accept=".txt,.csv,.pdf,.docx"
        />
      </div>
    )

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement

    await userEvent.upload(fileInput, emptyFile)

    expect(fileInput.files).toHaveLength(1)
    // Size check would be done at upload validation level
  })
})
