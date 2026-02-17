import React from "react";

export const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-700">
      <div className="relative mb-6">
        <div className="h-14 w-14 rounded-full border-[3px] border-slate-200" />
        <div className="absolute inset-0 h-14 w-14 rounded-full border-[3px] border-transparent border-t-blue-500 border-l-blue-400 animate-spin" />
        <div className="absolute inset-2 h-10 w-10 rounded-full bg-white" />
      </div>
      <div className="text-base font-medium tracking-tight">불러오는 중...</div>
      <div className="text-xs text-slate-400 mt-1">잠시만 기다려주세요.</div>
    </div>
  );
};
