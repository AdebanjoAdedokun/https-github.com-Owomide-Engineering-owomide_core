class ImportPipelineError(Exception):
    """Base exception for import processing failures."""


class InvalidImportError(ImportPipelineError):
    """The source file or request is invalid and retrying cannot fix it."""


class UploadTooLargeError(InvalidImportError):
    """The upload exceeded its configured byte limit."""


class ImportLimitError(InvalidImportError):
    """The parsed workbook exceeded a configured row or column limit."""
