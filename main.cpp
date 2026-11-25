#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>
#include <time.h>
#include "board.h"
#if __has_include("local.h")
#include "local.h"
#else
#include "local.example.h"
#endif

// Board I/O belongs to the safety loop. Network traffic runs on a separate task.
struct Request { char id[37]; bool start; float minutes; int64_t expiresAt; };
struct Reply { char id[37]; bool applied; };
struct Snapshot { SensorReading reading; bool running; };
QueueHandle_t requests, replies, snapshots;
bool running=false;
uint32_t runningSince=0, runLimit=0;
volatile uint32_t lastServerContact=0;
constexpr uint32_t linkTimeoutMs=8000, flowGraceMs=2500;
Preferences records;
bool recordsReady=false;
String lastId;
bool lastResult=false;

int64_t utcMs() {
  timeval tv;
  gettimeofday(&tv,nullptr);
  return int64_t(tv.tv_sec)*1000+tv.tv_usec/1000;
}
bool valid(const SensorReading &s) {
  return s.valid && isfinite(s.volumeL) && isfinite(s.capacityL) && s.capacityL>0 &&
    s.volumeL>=0 && s.volumeL<=s.capacityL && isfinite(s.flowLmin) && s.flowLmin>=0 &&
    isfinite(s.panelV)&&s.panelV>=0 && isfinite(s.panelA)&&s.panelA>=0;
}
bool interlocks(const SensorReading &s) {
  return valid(s) && s.emergencyOk && s.minimumOk && s.currentOk && s.solarOk;
}
void stopPump() { drivePump(false);running=false; }
void handle(const Request &q,const SensorReading &s) {
  Reply reply{};
  strlcpy(reply.id,q.id,sizeof(reply.id));
  if(lastId==q.id) reply.applied=lastResult;
  else if(q.expiresAt>=utcMs() && q.expiresAt-utcMs()<=11000 && recordsReady) {
    // Persist a refusal first. A power failure never replays an in-flight start.
    lastId=q.id;lastResult=false;
    bool stored=records.putString("last",lastId)==lastId.length();
    if(stored && !q.start) {stopPump();reply.applied=true;}
    else if(stored && !running && interlocks(s) && s.canStart && q.minutes>0 && q.minutes<=120) {
      drivePump(true);running=true;runningSince=millis();runLimit=uint32_t(q.minutes*60000);
      reply.applied=true;
    }
    lastResult=reply.applied;
    Serial.println(reply.applied?"Commande acquittee":"Commande refusee");
  }
  xQueueOverwrite(replies,&reply);
}
bool exchange(const String &path,JsonDocument *body,JsonDocument &response) {
  WiFiClientSecure client;
  client.setCACert(ROOT_CERT_PEM);
  HTTPClient http;
  http.setConnectTimeout(1500);http.setTimeout(1500);
  if(!http.begin(client,String(HTTPS_ORIGIN)+path)) return false;
  http.addHeader("Authorization",String("Bearer ")+DEVICE_TOKEN);
  int code;
  if(body) {
    String json;serializeJson(*body,json);http.addHeader("Content-Type","application/json");
    code=http.POST(json);
  } else code=http.GET();
  bool ok=code>=200&&code<300&&!deserializeJson(response,http.getString());
  http.end();
  if(ok) lastServerContact=millis();
  return ok;
}
void networkTask(void*) {
  Reply pending{};
  for(;;) {
    vTaskDelay(pdMS_TO_TICKS(900));
    if(WiFi.status()!=WL_CONNECTED || utcMs()<1700000000000LL) continue;
    Snapshot s{};
    if(xQueuePeek(snapshots,&s,0)!=pdTRUE || !valid(s.reading))continue;
    JsonDocument report,response;
    report["deviceId"]=DEVICE_ID;report["at"]=utcMs();report["volumeL"]=s.reading.volumeL;
    report["capacityL"]=s.reading.capacityL;report["flowLmin"]=s.reading.flowLmin;
    report["panelV"]=s.reading.panelV;report["panelA"]=s.reading.panelA;
    report["pumpOn"]=s.running;report["interlocksOk"]=interlocks(s.reading);report["ready"]=s.reading.canStart;
    if(!exchange("/api/device/telemetry",&report,response))continue;
    if(!pending.id[0])xQueueReceive(replies,&pending,0);
    if(pending.id[0]) {
      JsonDocument ack;ack["id"]=pending.id;ack["status"]=pending.applied?"applied":"refused";
      if(exchange("/api/device/ack",&ack,response))pending={};
      continue;
    }
    if(!exchange("/api/device/next",nullptr,response))continue;
    JsonObject cmd=response["command"].as<JsonObject>();
    if(cmd.isNull() || String(cmd["deviceId"]|"")!=DEVICE_ID)continue;
    const char *id=cmd["id"]|"", *action=cmd["action"]|"";
    if(strlen(id)!=36 || (strcmp(action,"start") && strcmp(action,"stop")))continue;
    Request q{};strlcpy(q.id,id,sizeof(q.id));q.start=!strcmp(action,"start");
    q.minutes=cmd["minutes"]|0.f;q.expiresAt=cmd["expiresAt"].as<int64_t>();
    xQueueOverwrite(requests,&q);
  }
}
void setup() {
  boardBegin();stopPump();Serial.begin(115200);
  recordsReady=records.begin("floreol",false);
  lastId=records.getString("last","");
  requests=xQueueCreate(1,sizeof(Request));replies=xQueueCreate(1,sizeof(Reply));snapshots=xQueueCreate(1,sizeof(Snapshot));
  if(!requests || !replies || !snapshots) {for(;;){stopPump();delay(500);}}
  if(strlen(WIFI_SSID)&&strlen(DEVICE_TOKEN)>=32&&strlen(ROOT_CERT_PEM)&&String(HTTPS_ORIGIN).startsWith("https://")){
    WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
    configTime(0,0,"pool.ntp.org","time.cloudflare.com");
    xTaskCreate(networkTask,"floreol_net",8192,nullptr,1,nullptr);
  }
#if ESP_IDF_VERSION_MAJOR >= 5
  esp_task_wdt_config_t cfg{};cfg.timeout_ms=5000;cfg.trigger_panic=true;
  esp_task_wdt_init(&cfg);
#else
  esp_task_wdt_init(5,true);
#endif
  esp_task_wdt_add(nullptr);
}
void loop() {
  const auto s=readSensors();
  if(running && (!interlocks(s) || WiFi.status()!=WL_CONNECTED ||
    millis()-lastServerContact>=linkTimeoutMs || millis()-runningSince>=runLimit ||
    (millis()-runningSince>=flowGraceMs && s.flowLmin<=0))) {
    stopPump();Serial.println("Arret de securite local");
  }
  Request q{};if(xQueueReceive(requests,&q,0)==pdTRUE)handle(q,s);
  Snapshot snap{s,running};xQueueOverwrite(snapshots,&snap);
  esp_task_wdt_reset();delay(20);
}
