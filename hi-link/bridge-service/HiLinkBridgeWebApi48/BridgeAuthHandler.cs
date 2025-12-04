using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace HiLinkBridgeWebApi48
{
    /// <summary>
    /// 간단한 공유 시크릿 기반 인증 핸들러.
    /// BRIDGE_SHARED_SECRET 환경변수가 설정되어 있으면
    /// 모든 요청에서 X-Bridge-Secret 헤더를 검증한다.
    /// 값이 없으면 인증을 비활성화(개발용)한다.
    /// </summary>
    public class BridgeAuthHandler : DelegatingHandler
    {
        private static readonly string SharedSecret =
            Environment.GetEnvironmentVariable("BRIDGE_SHARED_SECRET") ?? string.Empty;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Console.WriteLine("[BridgeAuth] {0} {1}", request.Method, request.RequestUri);

            // 시크릿이 비어 있으면 인증 비활성화
            if (string.IsNullOrEmpty(SharedSecret))
            {
                Console.WriteLine("[BridgeAuth] SharedSecret is empty -> auth disabled");
                return base.SendAsync(request, cancellationToken);
            }

            if (!request.Headers.TryGetValues("X-Bridge-Secret", out var values))
            {
                Console.WriteLine("[BridgeAuth] Missing X-Bridge-Secret header");
                var unauthorized = request.CreateResponse(HttpStatusCode.Unauthorized, new
                {
                    success = false,
                    message = "Missing X-Bridge-Secret header"
                });
                var tcs = new TaskCompletionSource<HttpResponseMessage>();
                tcs.SetResult(unauthorized);
                return tcs.Task;
            }

            var provided = string.Join(",", values ?? Array.Empty<string>());
            if (!string.Equals(provided, SharedSecret, StringComparison.Ordinal))
            {
                Console.WriteLine("[BridgeAuth] Invalid X-Bridge-Secret header value");
                var unauthorized = request.CreateResponse(HttpStatusCode.Unauthorized, new
                {
                    success = false,
                    message = "Invalid bridge secret"
                });
                var tcs = new TaskCompletionSource<HttpResponseMessage>();
                tcs.SetResult(unauthorized);
                return tcs.Task;
            }

            Console.WriteLine("[BridgeAuth] Authorized");
            return base.SendAsync(request, cancellationToken);
        }
    }
}
