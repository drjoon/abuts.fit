using System;
using System.Reflection;
using System.Runtime.InteropServices;
using Esprit;
using EspritCommands;
using EspritConstants;
using EspritMenus;
using Extensibility;

namespace DentalAddin
{
    /// <summary>
    /// Esprit 애드인 진입점 (UI 없음)
    /// </summary>
    [ProgId("DentalAddin.Connect")]
    [Guid("74E17CE8-C077-4E1F-AB7A-2449AE193FF9")]
    [ClassInterface(ClassInterfaceType.None)]
    [ComVisible(true)]
    public class Connect : IDTExtensibility2
    {
        private Application _espritApp;
        private AddIn _addIn;
        private int _cookie;
        private int _commandId;

        public void OnConnection(object application, ext_ConnectMode connectMode, object addInInst, ref Array custom)
        {
            try
            {
                _espritApp = (Application)application;
                _addIn = (AddIn)addInInst;

                // 라이선스 검증
                string customerCode = _espritApp.License.CustomerCode?.ToString() ?? "";
                string serialNumber = _espritApp.License.SerialNumber?.ToString() ?? "";

                if (!LicenseValidator.ValidateLicense(_espritApp.Path, customerCode, serialNumber))
                {
                    _espritApp.OutputWindow.Text("덴탈 애드인: 라이선스가 유효하지 않습니다.\r\n");
                    return;
                }

                // 커맨드 등록
                _cookie = _addIn.GetCookie();
                _commandId = _addIn.AddCommand(_cookie, 1, "DentalProcess");

                // 메뉴에 추가
                AddToMenu();

                // 이벤트 핸들러 등록
                _addIn.OnCommand += AddIn_OnCommand;

                _espritApp.OutputWindow.Text("덴탈 애드인 로드 완료\r\n");
            }
            catch (Exception ex)
            {
                if (_espritApp != null)
                {
                    _espritApp.OutputWindow.Text($"덴탈 애드인 로드 오류: {ex.Message}\r\n");
                }
            }
        }

        public void OnDisconnection(ext_DisconnectMode removeMode, ref Array custom)
        {
            try
            {
                if (_addIn != null)
                {
                    _addIn.OnCommand -= AddIn_OnCommand;
                }

                _espritApp = null;
                _addIn = null;
            }
            catch (Exception)
            {
                // 정리 실패 무시
            }
        }

        public void OnStartupComplete(ref Array custom)
        {
        }

        public void OnAddInsUpdate(ref Array custom)
        {
        }

        public void OnBeginShutdown(ref Array custom)
        {
        }

        private void AddIn_OnCommand(int cookie, int commandId)
        {
            if (cookie != _cookie || commandId != _commandId)
            {
                return;
            }

            try
            {
                // 덴탈 프로세스 실행
                DentalPipeline.Run(_espritApp);
            }
            catch (Exception ex)
            {
                _espritApp.OutputWindow.Text($"덴탈 프로세스 실행 오류: {ex.Message}\r\n");
            }
        }

        private void AddToMenu()
        {
            try
            {
                // View 메뉴에 추가
                Menu viewMenu = _espritApp.Menus[3] as Menu;
                if (viewMenu == null)
                {
                    return;
                }

                // Toolbars 서브메뉴 찾기
                for (int i = 1; i <= viewMenu.Count; i++)
                {
                    MenuItem menuItem = viewMenu[i];
                    string menuName = menuItem.Name ?? "";

                    if (menuName.Contains("Toolbar") || menuName.Contains("툴바") || menuName.Contains("工具栏"))
                    {
                        Menu subMenu = menuItem.SubMenu;
                        if (subMenu != null)
                        {
                            // 구분선 추가
                            if (subMenu[subMenu.Count].Type != espMenuItemType.espMenuItemSeparator)
                            {
                                subMenu.Add(espMenuItemType.espMenuItemSeparator, "Separator", Missing.Value, Missing.Value);
                            }

                            // 덴탈 메뉴 추가
                            subMenu.Add(espMenuItemType.espMenuItemCommand, "Dental Process", _commandId, Missing.Value);
                        }
                        break;
                    }
                }
            }
            catch (Exception)
            {
                // 메뉴 추가 실패 무시
            }
        }
    }
}
