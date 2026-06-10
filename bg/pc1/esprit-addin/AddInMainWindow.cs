using System;

using System.Drawing;

using System.Windows.Forms;



namespace Abuts.EspritAddIns.ESPRIT2025AddinProject

{

    // [정책] storage 폴더 파일 목록 UI 제거.

    // esprit-addin은 백엔드 HTTP 트리거 방식만 사용하므로 파일 선택 창이 불필요함.

    // AddInMainWindow는 현재 사용되지 않으며 Connect.cs에서 마스키드 상태로 유지.

    public class AddInMainWindow : Form

    {

        public AddInMainWindow()

        {

            FormBorderStyle = FormBorderStyle.FixedSingle;

            StartPosition = FormStartPosition.Manual;

            Text = "abuts.fit CAM addin";

            ClientSize = new Size(200, 40);

            TopMost = false;

            ShowInTaskbar = false;

            WindowState = FormWindowState.Minimized;

        }



        public void ShowWindow()

        {

            // 사용안함 — 데스크탑 노출 전단 방지

        }



        protected override void OnFormClosing(FormClosingEventArgs e)

        {

            base.OnFormClosing(e);

            if (e.CloseReason == CloseReason.UserClosing)

            {

                e.Cancel = true;

                Hide();

            }

        }

    }

}

