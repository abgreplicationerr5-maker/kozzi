import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiPost, errorMessage } from "@/lib/api";
import type { Project } from "@/lib/types";
import { notifyError } from "@/lib/notify";

export function useCreateProject() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (prompt: string) => apiPost<Project>("/projects", { prompt }),
    onSuccess: (p) => {
      qc.setQueryData(["project", p.id], p);
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/builder/${p.id}`);
    },
    onError: (e) => notifyError(e),
  });
}

export function useDuplicateProject(openAfter = false) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => apiPost<Project>(`/projects/${id}/duplicate`),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`“${p.title}” added to your workspace`);
      if (openAfter) navigate(`/builder/${p.id}`);
    },
    onError: (e) => notifyError(e),
  });
}

export async function copyText(text: string, label = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}
