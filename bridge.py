"""Local HTTPS contract test. Uses cryptography and a disposable certificate."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import http.client
import ipaddress
import json
import os
import secrets
import socket
import ssl
import subprocess
import time
import uuid
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

def run():
    with TemporaryDirectory() as folder:
        root = Path(folder)
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
        now = datetime.now(timezone.utc)
        authority = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Floréol local test root")])
        ca = (x509.CertificateBuilder().subject_name(issuer).issuer_name(issuer).public_key(authority.public_key())
              .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=2))
              .not_valid_after(now+timedelta(hours=2)).add_extension(x509.BasicConstraints(ca=True,path_length=0),True)
              .add_extension(x509.SubjectKeyIdentifier.from_public_key(authority.public_key()),False)
              .add_extension(x509.KeyUsage(False,False,False,False,False,True,True,False,False),True)
              .sign(authority,hashes.SHA256()))
        ca_path=root/"test-ca.crt"
        ca_path.write_bytes(ca.public_bytes(serialization.Encoding.PEM))
        cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(issuer)
                .public_key(key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(hours=1))
                .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1")),x509.DNSName("localhost")]), False)
                .add_extension(x509.BasicConstraints(ca=False,path_length=None),True)
                .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(authority.public_key()),False)
                .sign(authority, hashes.SHA256()))
        private, public = root/"test.key", root/"test.crt"
        private.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
        public.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        tokens = {role:secrets.token_hex(32) for role in ["viewer","operator","admin","device"]}
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port = sock.getsockname()[1]
        env = {**os.environ, **{r.upper()+"_TOKEN":v for r,v in tokens.items()},
               "TLS_KEY":str(private),"TLS_CERT":str(public),"DATA_DIR":str(root/"store"),
               "ALLOWED_ORIGIN":"https://localhost","DEVICE_ID":"banc","PORT":str(port),"BIND_HOST":"127.0.0.1"}
        ctx = ssl.create_default_context()
        ctx.load_verify_locations(cafile=str(ca_path))
        checks=[]
        def request(route, role="viewer", data=None):
            conn=http.client.HTTPSConnection("localhost",port,context=ctx,timeout=3)
            headers={"Authorization":"Bearer "+tokens.get(role,"invalid"),"Content-Type":"application/json"}
            try:
                conn.request("GET" if data is None else "POST",route,None if data is None else json.dumps(data),headers)
                response=conn.getresponse()
                return response.status,json.loads(response.read())
            finally:
                conn.close()
        with subprocess.Popen(["node","backend/server.mjs"],env=env,stdout=subprocess.DEVNULL) as backend:
            try:
                for _ in range(80):
                    try:
                        if request("/api/status")[0]==200: break
                    except ssl.SSLCertVerificationError as exc:
                        actual=x509.load_pem_x509_certificate(ssl.get_server_certificate(("localhost",port)).encode())
                        raise RuntimeError("Certificat présenté par le transport local · "+actual.issuer.rfc4514_string()) from exc
                    except OSError:
                        time.sleep(.1)
                assert request("/api/status","unknown")[0]==401
                assert request("/api/status")[1]["telemetry"] is None
                cmd={"id":str(uuid.uuid4()),"deviceId":"banc","action":"start","minutes":10,"confirmed":True}
                assert request("/api/commands","viewer",cmd)[0]==403
                assert request("/api/commands","operator",cmd)[0]==409
                checks.append("Authentification, rôle visiteur et blocage sans télémétrie")
                def telemetry():
                    return {"deviceId":"banc","at":int(time.time()*1000),"volumeL":100,"capacityL":500,"panelV":12,
                            "panelA":1.1,"pumpOn":False,"interlocksOk":True,"ready":True,"flowLmin":0}
                data=telemetry()
                assert request("/api/device/telemetry","device",{**data,"at":data["at"]-20000})[0]==422
                assert request("/api/device/telemetry","device",data)[0]==200
                assert request("/api/commands","operator",{**cmd,"confirmed":False})[0]==422
                assert request("/api/commands","operator",cmd)[0]==202
                assert request("/api/commands","operator",cmd)[0]==200
                assert request("/api/device/next","device")[1]["command"]["id"]==cmd["id"]
                assert request("/api/device/ack","device",{"id":cmd["id"],"status":"applied"})[0]==200
                assert request("/api/commands/"+cmd["id"],"operator")[1]["status"]=="applied"
                checks.append("Télémétrie de test, confirmation, déduplication, acquittement et lecture du résultat")
                assert request("/api/assistant","viewer",{"question":"test","context":"simulation"})[0]==403
                assert request("/api/assistant","operator",{"question":"test","context":"simulation"})[0]==503
                checks.append("Assistant externe inactif sans fournisseur configuré")
                Path("docs/validation/backend.json").write_text(json.dumps({"essai":"passerelle HTTPS locale, appareil fictif","checks":checks},ensure_ascii=False,indent=2),encoding="utf-8")
                print("Passerelle HTTPS locale valide.")
            finally:
                backend.terminate()
if __name__=="__main__":
    run()