"""Study metadata service for loading and serving study portfolio data."""

import json
from pathlib import Path
from typing import List, Optional
from models.study_metadata import StudyMetadata, Project


class StudyMetadataService:
    """Service for managing study portfolio metadata."""

    def __init__(self, data_file: str = "data/study_metadata.json"):
        """
        Initialize the service and load study data.

        Args:
            data_file: Path to the study metadata JSON file
        """
        self.data_file = Path(data_file)
        self.studies: List[StudyMetadata] = []
        self.projects: List[Project] = []
        self._load_data()

    def _load_data(self) -> None:
        """Load study metadata and projects from JSON file."""
        if not self.data_file.exists():
            print(f"Warning: Study metadata file not found: {self.data_file}")
            return

        try:
            with open(self.data_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            # Load projects
            self.projects = [Project(**p) for p in data.get("projects", [])]

            # Load studies
            self.studies = [StudyMetadata(**s) for s in data.get("studies", [])]

            print(f"Loaded {len(self.studies)} studies and {len(self.projects)} projects")

        except Exception as e:
            print(f"Error loading study metadata: {e}")
            raise

    def get_all_studies(self) -> List[StudyMetadata]:
        """
        Get all studies.

        Returns:
            List of all study metadata objects
        """
        return self.studies

    def get_study(self, study_id: str) -> Optional[StudyMetadata]:
        """
        Get a single study by ID.

        Args:
            study_id: Study identifier (e.g., "PC201708")

        Returns:
            Study metadata or None if not found
        """
        for study in self.studies:
            if study.id == study_id:
                return study
        return None

    def get_studies_by_compound(self, test_article: str) -> List[StudyMetadata]:
        """
        Get all studies for a specific compound.

        Args:
            test_article: Compound name (e.g., "PCDRUG")

        Returns:
            List of studies for that compound
        """
        return [s for s in self.studies if s.test_article == test_article]

    def get_studies_by_project(self, project_id: str) -> List[StudyMetadata]:
        """
        Get all studies for a specific project.

        Args:
            project_id: Project identifier (e.g., "proj_pcdrug")

        Returns:
            List of studies in that project
        """
        return [s for s in self.studies if s.project == project_id]

    def get_all_projects(self) -> List[Project]:
        """
        Get all projects.

        Returns:
            List of all project metadata objects
        """
        return self.projects

    def get_project(self, project_id: str) -> Optional[Project]:
        """
        Get a single project by ID.

        Args:
            project_id: Project identifier

        Returns:
            Project metadata or None if not found
        """
        for project in self.projects:
            if project.id == project_id:
                return project
        return None


# Global service instance
_service: Optional[StudyMetadataService] = None


def get_study_metadata_service() -> StudyMetadataService:
    """
    Get the global study metadata service instance.

    Returns:
        Singleton service instance
    """
    global _service
    if _service is None:
        _service = StudyMetadataService()
    return _service
