CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, profile TEXT NOT NULL);
CREATE TABLE records(collection TEXT NOT NULL,id TEXT NOT NULL,user_id TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(collection,id));
CREATE INDEX records_user ON records(collection,user_id);
CREATE INDEX records_deck ON records(collection,user_id,json_extract(data,'$.deck_id'));
CREATE TABLE sessions(access_hash TEXT PRIMARY KEY,refresh_hash TEXT UNIQUE NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,refresh_expires_at INTEGER NOT NULL);
CREATE TABLE login_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL);
CREATE TABLE uploads(bucket TEXT NOT NULL,path TEXT NOT NULL,user_id TEXT NOT NULL,content_type TEXT NOT NULL,size INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(bucket,path));
CREATE TABLE upload_parts(bucket TEXT NOT NULL,path TEXT NOT NULL,part INTEGER NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(bucket,path,part));
