import type Database from "better-sqlite3";
import { ArtifactsRepo } from "./repos/artifacts";
import { ChatsRepo } from "./repos/chats";
import { MessagesRepo } from "./repos/messages";
import { ProjectsRepo } from "./repos/projects";
import { RunsRepo } from "./repos/runs";
import { StepsRepo } from "./repos/steps";

export interface StorageRepos {
  projects: ProjectsRepo;
  chats: ChatsRepo;
  messages: MessagesRepo;
  runs: RunsRepo;
  steps: StepsRepo;
  artifacts: ArtifactsRepo;
}

export function createRepos(db: Database.Database): StorageRepos {
  return {
    projects: new ProjectsRepo(db),
    chats: new ChatsRepo(db),
    messages: new MessagesRepo(db),
    runs: new RunsRepo(db),
    steps: new StepsRepo(db),
    artifacts: new ArtifactsRepo(db)
  };
}
