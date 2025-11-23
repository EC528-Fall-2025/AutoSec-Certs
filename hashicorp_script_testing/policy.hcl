path "pki/issue/test-owner-5" {
	capabilities = ["create", "update"]
}
path "secret/data/certs/test-owner-5/*" {
	capabilities = ["create", "read", "update", "delete", "list"]
}
path "secret/metadata/certs/test-owner-5/*" {
	capabilities = ["list"]
}
path "identity/entity/name/test-owner-5" {
	capabilities = ["read", "update"]
}
