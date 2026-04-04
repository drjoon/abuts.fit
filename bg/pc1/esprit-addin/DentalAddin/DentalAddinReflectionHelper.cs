using System;
using System.Reflection;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.DentalAddin
{
    /// <summary>
    /// DentalAddin Reflection 기반 필드/메서드 접근 유틸리티
    /// </summary>
    public static class DentalAddinReflectionHelper
    {
        public static Type ResolveMainModuleType()
        {
            return typeof(global::DentalAddin.MainModule);
        }

        public static Type ResolveMoveModuleType(Type mainModuleType)
        {
            return mainModuleType?.Assembly?.GetType("DentalAddin.MoveSTL_Module", false, true);
        }

        public static void SetStaticField(Type targetType, string fieldName, object value)
        {
            FieldInfo field = targetType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null)
            {
                AppLogger.Log($"DentalAddin: {targetType?.FullName ?? "알 수 없는 타입"}.{fieldName} 필드를 찾을 수 없습니다.");
                return;
            }
            field.SetValue(null, value);
        }

        public static void SetStaticProperty(Type targetType, string propertyName, object value)
        {
            PropertyInfo property = targetType?.GetProperty(propertyName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (property == null || !property.CanWrite)
            {
                AppLogger.Log($"DentalAddin: {targetType?.FullName ?? "알 수 없는 타입"}.{propertyName} 프로퍼티를 설정할 수 없습니다.");
                return;
            }
            property.SetValue(null, value);
        }

        public static T GetMainModuleField<T>(Type mainModuleType, string fieldName) where T : class
        {
            FieldInfo field = mainModuleType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            return field?.GetValue(null) as T;
        }

        public static TField GetStaticFieldValue<TField>(string typeName, string fieldName)
        {
            try
            {
                Type type = Type.GetType(typeName);
                FieldInfo field = type?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (field == null)
                {
                    return default;
                }
                object value = field.GetValue(null);
                if (value is TField typed)
                {
                    return typed;
                }
                return default;
            }
            catch
            {
                return default;
            }
        }

        public static bool TryInvokeMainModuleMethod(Type mainModuleType, string methodName, bool logMissing = true, params object[] args)
        {
            MethodInfo method = mainModuleType?.GetMethod(methodName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null)
            {
                if (logMissing)
                {
                    AppLogger.Log($"DentalAddin: {mainModuleType?.FullName ?? "알 수 없는 타입"}.{methodName} 메서드를 찾을 수 없습니다.");
                }
                return false;
            }
            try
            {
                method.Invoke(null, args);
            }
            catch (TargetInvocationException tie)
            {
                Exception root = tie.GetBaseException();
                AppLogger.Log($"DentalAddin: {methodName} 실행 실패\n{root}");
                throw;
            }
            return true;
        }

        public static bool TryInvokeModuleMethod(Type moduleType, string methodName, params object[] args)
        {
            MethodInfo method = moduleType?.GetMethod(methodName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null)
            {
                AppLogger.Log($"DentalAddin: {moduleType?.FullName ?? "알 수 없는 타입"}.{methodName} 메서드를 찾을 수 없습니다.");
                return false;
            }
            try
            {
                method.Invoke(null, args);
                return true;
            }
            catch (TargetInvocationException tie)
            {
                Exception root = tie.GetBaseException();
                AppLogger.Log($"DentalAddin: {methodName} 실행 중 예외 발생\n{root}");
                throw;
            }
        }

        public static void ResetStaticArrayField(Type targetType, string fieldName, int length)
        {
            FieldInfo field = targetType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null)
            {
                AppLogger.Log($"DentalAddin: {targetType?.FullName ?? "알 수 없는 타입"}.{fieldName} 배열 필드를 찾을 수 없습니다.");
                return;
            }
            Type fieldType = field.FieldType;
            if (!fieldType.IsArray)
            {
                AppLogger.Log($"DentalAddin: {targetType?.FullName ?? "알 수 없는 타입"}.{fieldName} 는 배열 필드가 아닙니다.");
                return;
            }
            Type elementType = fieldType.GetElementType() ?? typeof(object);
            Array emptyArray = Array.CreateInstance(elementType, Math.Max(0, length));
            field.SetValue(null, emptyArray);
        }

        public static bool TrySetFieldIfNull(Type targetType, string fieldName, double defaultValue)
        {
            FieldInfo field = targetType?.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null)
            {
                return false;
            }
            object currentValue = field.GetValue(null);
            if (currentValue is double doubleValue && !double.IsNaN(doubleValue))
            {
                return true;
            }
            field.SetValue(null, defaultValue);
            return true;
        }

        public static int GetCollectionCount(object collection)
        {
            if (collection == null)
            {
                return 0;
            }
            try
            {
                object value = collection.GetType().InvokeMember("Count", BindingFlags.GetProperty, null, collection, null);
                if (value is int count)
                {
                    return count;
                }
            }
            catch
            {
            }
            return 0;
        }
    }
}
