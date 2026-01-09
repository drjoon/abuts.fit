namespace HiLinkBridgeWebApi48.Models
{
    /// <summary>
    /// Hi-Link Mode2 DLL의 프로그램 활성화 요청 payload 형식.
    /// </summary>
    public class UpdateMachineActivateProgNo
    {
        public short headType { get; set; }
        public int programNo { get; set; }
    }
}
