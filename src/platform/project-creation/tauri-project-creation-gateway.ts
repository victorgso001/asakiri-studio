import { invoke } from "@tauri-apps/api/core";
import type { ProjectCreationGateway, ProjectDirectory } from "@core/projects";
import { ProjectCreationError, type ProjectCreationErrorCode } from "@core/projects";
import type { ProjectLocationRegistry } from "@platform/project-location/project-location-registry";
import type { RecentProjectsStore } from "@platform/project-location/recent-projects-store";

interface CreatedCourse {
  readonly name: string;
  readonly path: string;
}

const KNOWN_ERROR_CODES: readonly ProjectCreationErrorCode[] = [
  "alreadyExists",
  "invalidName",
  "permissionDenied",
];

function toErrorCode(error: unknown): ProjectCreationErrorCode {
  const value = typeof error === "string" ? error : "";
  return KNOWN_ERROR_CODES.find((code) => code === value) ?? "unknown";
}

export class TauriProjectCreationGateway implements ProjectCreationGateway {
  constructor(
    private readonly locations: ProjectLocationRegistry,
    private readonly recents: RecentProjectsStore,
  ) {}

  async createCourse(request: { readonly name: string }): Promise<ProjectDirectory | null> {
    try {
      const created = await invoke<CreatedCourse>("create_course", {
        // `parentPath` is only read by older builds of the Rust command. Recent
        // builds fall back to the system temporary directory (/tmp on Linux).
        parentPath: "/tmp",
        name: request.name,
      });

      const id = crypto.randomUUID();
      this.locations.register(id, { rootPath: created.path });
      this.recents.remember({
        id,
        name: created.name,
        locationLabel: created.name,
        rootPath: created.path,
      });

      return {
        id,
        name: created.name,
        locationLabel: created.name,
      };
    } catch (error) {
      // The dialog only shows a generic localized message, so keep the
      // underlying IPC/filesystem error visible in the developer console.
      console.error("Failed to create course", error);
      throw new ProjectCreationError(toErrorCode(error));
    }
  }
}
