class ImportPipelineError(Exception):
    """Base exception for import processing failures."""


class InvalidImportError(ImportPipelineError):
    """The source file or request is invalid and retrying cannot fix it."""


class UploadTooLargeError(InvalidImportError):
    """The upload exceeded its configured byte limit."""


class ImportLimitError(InvalidImportError):
    """The parsed workbook exceeded a configured row or column limit."""


class ImportResourceNotFoundError(ImportPipelineError):
    """An org-scoped import resource does not exist or is not visible."""


class ImportStateError(ImportPipelineError):
    """The requested operation is invalid for the resource's current lifecycle state."""


class ImportConflictError(ImportPipelineError):
    """The requested resource or operation conflicts with existing state."""
