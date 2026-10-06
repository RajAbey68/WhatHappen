alter table messages add column if not exists message_id text;
alter table messages drop constraint if exists messages_project_id_message_id_key;
alter table messages add constraint messages_project_id_message_id_key unique (project_id, message_id);
