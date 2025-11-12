path "pki/issue/test-owner-3" {
	capabilities = ["create", "update"]
}
path "secret/data/certs/test-owner-3/*" {
	capabilities = ["create", "read", "update", "delete", "list"]
}
path "secret/metadata/certs/test-owner-3/*" {
	capabilities = ["list"]
}
path "identity/entity/name/test-owner-3" {
	capabilities = ["read", "update"]
}
