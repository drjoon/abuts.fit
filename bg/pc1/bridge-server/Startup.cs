using System.Web.Http;
using Owin;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;


namespace HiLinkBridgeWebApi48
{
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            var config = new HttpConfiguration();

            config.MapHttpAttributeRoutes();

            // 브리지 공유 시크릿 기반 인증 핸들러 등록
            config.MessageHandlers.Add(new BridgeAuthHandler());

            config.Routes.MapHttpRoute(
                name: "DefaultApi",
                routeTemplate: "{controller}/{id}",
                defaults: new { id = RouteParameter.Optional }
            );

            config.Formatters.JsonFormatter.SerializerSettings.Formatting = Newtonsoft.Json.Formatting.Indented;

            app.UseWebApi(config);
        }
    }
}
