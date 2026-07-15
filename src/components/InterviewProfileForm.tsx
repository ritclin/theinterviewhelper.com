import React from "react";
import { Briefcase, Building2, FileText, User } from "lucide-react";
import { InterviewProfile } from "../types";

interface InterviewProfileFormProps {
  profile: InterviewProfile;
  onChange: (profile: InterviewProfile) => void;
  liveTranscript: string;
  onLiveTranscriptChange: (value: string) => void;
  screenContext: string;
  onScreenContextChange: (value: string) => void;
  compact?: boolean;
}

export function InterviewProfileForm({
  profile,
  onChange,
  liveTranscript,
  onLiveTranscriptChange,
  screenContext,
  onScreenContextChange,
  compact = false,
}: InterviewProfileFormProps) {
  const update = (field: keyof InterviewProfile, value: string) => {
    onChange({ ...profile, [field]: value });
  };

  return (
    <div className={`space-y-4 ${compact ? "" : "p-4 bg-slate-950/40 border border-slate-900 rounded-xl"}`}>
      {!compact && (
        <div>
          <h4 className="text-sm font-bold text-white font-display flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-indigo-400" />
            Your Interview Profile
          </h4>
          <p className="text-[11px] text-slate-400 mt-1">
            Add your target role, job description, and CV so AI answers match your background and the position.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
            Position interviewing for *
          </label>
          <input
            type="text"
            value={profile.targetPosition}
            onChange={(e) => update("targetPosition", e.target.value)}
            placeholder="e.g. Senior Software Engineer"
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Company (optional)
          </label>
          <input
            type="text"
            value={profile.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder="e.g. Google, Stripe, startup name"
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1">
          <FileText className="w-3 h-3" /> Job description
        </label>
        <textarea
          value={profile.jobDescription}
          onChange={(e) => update("jobDescription", e.target.value)}
          placeholder="Paste the job posting: responsibilities, required skills, tech stack, seniority..."
          rows={4}
          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none resize-y min-h-[88px]"
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1">
          <User className="w-3 h-3" /> Your CV / Resume
        </label>
        <textarea
          value={profile.userCv}
          onChange={(e) => update("userCv", e.target.value)}
          placeholder="Paste your CV summary: experience, projects, skills, achievements relevant to this role..."
          rows={4}
          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none resize-y min-h-[88px]"
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
          Live interviewer question / transcript
        </label>
        <textarea
          value={liveTranscript}
          onChange={(e) => onLiveTranscriptChange(e.target.value)}
          placeholder="What the interviewer just asked or said (from audio transcript or your notes)..."
          rows={3}
          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none resize-y"
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
          Screen content (code, question text, whiteboard)
        </label>
        <textarea
          value={screenContext}
          onChange={(e) => onScreenContextChange(e.target.value)}
          placeholder="Paste code on your screen, the coding question, or problem statement..."
          rows={4}
          className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3 py-2 text-[11px] text-slate-300 font-mono outline-none resize-y min-h-[100px]"
        />
      </div>
    </div>
  );
}
