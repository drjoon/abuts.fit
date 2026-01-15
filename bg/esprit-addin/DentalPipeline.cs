using System;
using Esprit;

namespace DentalAddin
{
    /// <summary>
    /// 덴탈 가공 파이프라인 - 전체 프로세스 실행
    /// </summary>
    public static class DentalPipeline
    {
        public static void Run(Application espritApp)
        {
            if (espritApp == null || espritApp.Document == null)
            {
                return;
            }

            DentalContext context = new DentalContext(espritApp, espritApp.Document);
            
            try
            {
                espritApp.Processing = true;
                espritApp.OutputWindow.Text("\r\n=== 덴탈 가공 프로세스 시작 ===\r\n");
                espritApp.OutputWindow.Text($"시작 시간: {DateTime.Now:yyyy-MM-dd HH:mm:ss}\r\n\r\n");

                // 1단계: 문서 정리
                espritApp.OutputWindow.Text("1. 문서 정리 중...\r\n");
                CleanupModule.CleanDocument(context);

                // 2단계: STL 모델 처리
                espritApp.OutputWindow.Text("2. STL 모델 분석 중...\r\n");
                if (!STLProcessor.ProcessSTLModel(context))
                {
                    espritApp.OutputWindow.Text("오류: STL 모델을 찾을 수 없습니다.\r\n");
                    return;
                }

                // 화면 맞춤
                context.Document.Windows.ActiveWindow.Fit();

                // 3단계: 선삭 가공 처리
                espritApp.OutputWindow.Text("3. 선삭 가공 생성 중...\r\n");
                if (!TurningProcessor.ProcessTurning(context))
                {
                    espritApp.OutputWindow.Text("경고: 선삭 가공 생성 실패\r\n");
                }

                context.Document.Windows.ActiveWindow.Fit();

                // 4단계: 밀링 가공 처리 (RoughType에 따라)
                if (context.RoughType == 1.0 && context.ErrorFlag == 0)
                {
                    espritApp.OutputWindow.Text("4. 밀링 가공 생성 중...\r\n");
                    MillingProcessor.ProcessMilling(context);
                }

                context.Document.Windows.ActiveWindow.Fit();

                // 5단계: 완료
                espritApp.OutputWindow.Text("\r\n=== 덴탈 가공 프로세스 완료 ===\r\n");
                espritApp.OutputWindow.Text($"완료 시간: {DateTime.Now:yyyy-MM-dd HH:mm:ss}\r\n");

                // 설정 저장
                ConfigManager.SaveConfig(context.Config);
            }
            catch (Exception ex)
            {
                espritApp.OutputWindow.Text($"\r\n오류 발생: {ex.Message}\r\n");
                espritApp.OutputWindow.Text($"스택 트레이스: {ex.StackTrace}\r\n");
            }
            finally
            {
                espritApp.Processing = false;
            }
        }
    }
}
