#region 어셈블리 DentalAddin, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null
// C:\Program Files (x86)\D.P.Technology\ESPRIT\AddIns\DentalAddin\DentalAddin.dll
// Decompiled with ICSharpCode.Decompiler 9.1.0.7988
#endregion

using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Xml.Serialization;

namespace DentalAddin;

public class SerializableData
{
    public void Save(string filename)
    {
        string text = filename + ".tmp";
        FileInfo fileInfo = new FileInfo(text);
        if (fileInfo.Exists)
        {
            fileInfo.Delete();
        }

        FileStream fileStream = new FileStream(text, FileMode.Create);
        Save(fileStream);
        fileStream.Close();
        fileInfo.CopyTo(filename, overwrite: true);
        fileInfo.Delete();
    }

    public void Save(Stream stream)
    {
        //IL_0006: Unknown result type (might be due to invalid IL or missing references)
        new XmlSerializer(GetType()).Serialize(stream, (object)this);
    }

    public static object Load(string filename, Type newType)
    {
        if (!new FileInfo(filename).Exists)
        {
            return Activator.CreateInstance(newType);
        }

        FileStream fileStream = new FileStream(filename, FileMode.Open);
        object objectValue = RuntimeHelpers.GetObjectValue(Load(fileStream, newType));
        fileStream.Close();
        return objectValue;
    }

    public static object Load(Stream stream, Type newType)
    {
        //IL_0001: Unknown result type (might be due to invalid IL or missing references)
        return RuntimeHelpers.GetObjectValue(new XmlSerializer(newType).Deserialize(stream));
    }
}
#if false // 디컴파일 로그
캐시의 '12'개 항목
------------------
확인: 'Microsoft.VisualBasic, Version=10.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'
'Microsoft.VisualBasic, Version=10.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a' 이름으로 찾을 수 없습니다.
------------------
확인: 'mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
단일 어셈블리를 찾았습니다. 'mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\mscorlib.dll'
------------------
확인: 'System.Drawing, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'
단일 어셈블리를 찾았습니다. 'System.Drawing, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\System.Drawing.dll'
------------------
확인: 'System, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
단일 어셈블리를 찾았습니다. 'System, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\System.dll'
------------------
확인: 'System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
단일 어셈블리를 찾았습니다. 'System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\System.Windows.Forms.dll'
------------------
확인: 'Interop.EspritGeometry, Version=2.0.0.0, Culture=neutral, PublicKeyToken=null'
'Interop.EspritGeometry, Version=2.0.0.0, Culture=neutral, PublicKeyToken=null' 이름으로 찾을 수 없습니다.
------------------
확인: 'Interop.EspritFeatures, Version=2.0.0.0, Culture=neutral, PublicKeyToken=null'
'Interop.EspritFeatures, Version=2.0.0.0, Culture=neutral, PublicKeyToken=null' 이름으로 찾을 수 없습니다.
------------------
확인: 'System.Core, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
단일 어셈블리를 찾았습니다. 'System.Core, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\System.Core.dll'
------------------
확인: 'BouncyCastle.Crypto, Version=1.9.0.0, Culture=neutral, PublicKeyToken=0e99375e54769942'
'BouncyCastle.Crypto, Version=1.9.0.0, Culture=neutral, PublicKeyToken=0e99375e54769942' 이름으로 찾을 수 없습니다.
------------------
확인: 'System.Xml, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
'System.Xml, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089' 이름으로 찾을 수 없습니다.
#endif
